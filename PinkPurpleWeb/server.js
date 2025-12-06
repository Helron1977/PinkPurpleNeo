const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    // Enable compression for better bandwidth usage
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        threshold: 1024 // Only compress messages larger than 1KB
    },
    // Optimize ping/pong for lower latency
    pingTimeout: 20000,
    pingInterval: 25000
});
const path = require('path');

// Import Modules
const { WIDTH, HEIGHT, GRAVITY, T_INC, R_MIN, R_MAX } = require('./server/constants');
const Player = require('./server/entities/Player');
const Grenade = require('./server/entities/Grenade');
const GameRoom = require('./server/core/GameRoom');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// --- ROOM MANAGEMENT ---
const rooms = {}; // Map<roomId, GameRoom>
const socketToRoom = {}; // Map<socketId, roomId>

function generateRoomId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Bot Manager
const BotManager = require('./bot/BotManager');
const botManager = new BotManager(Player, Grenade, io);

// Fonction helper pour notifier les bots des événements
function notifyBotsInRoom(roomId, event) {
    const botAI = botManager.activeBots.get(roomId);
    if (botAI) {
        botAI.onGameEvent(event);
    }
}

function notifyBotsGameEnd(roomId, winner) {
    const botAI = botManager.activeBots.get(roomId);
    if (botAI) {
        botAI.onGameEnd();
    }
}

// Callbacks passed to GameRoom to decouple it from BotManager
const botCallbacks = {
    onEvent: (roomId, event) => notifyBotsInRoom(roomId, event),
    onGameEnd: (roomId, winner) => notifyBotsGameEnd(roomId, winner)
};

// Game Loop
// Physics at 50Hz (reduced from 60Hz for balanced gameplay)
const PHYSICS_TICK_RATE = 50;
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        room.updatePhysics();
        // Vérifier si un bot doit être activé/désactivé
        botManager.checkRoom(room);
    }
}, 1000 / PHYSICS_TICK_RATE);

// Network Broadcast at 30Hz (saves bandwidth, sufficient for this game type)
setInterval(() => {
    for (const roomId in rooms) {
        // Only broadcast if there are players in the room
        if (Object.keys(rooms[roomId].players).length > 0) {
            rooms[roomId].broadcastState();
        }
    }
}, 1000 / 30);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', (name) => {
        const roomId = generateRoomId();
        rooms[roomId] = new GameRoom(roomId, io, botCallbacks);
        socket.emit('room_created', roomId);
    });

    socket.on('join_room', (data) => {
        let roomId, playerName;
        if (typeof data === 'object') {
            roomId = data.roomId;
            playerName = data.playerName;
        } else {
            roomId = data;
            playerName = "Player";
        }

        roomId = roomId.toUpperCase();
        if (rooms[roomId]) {
            // Si un bot est présent, le retirer d'abord
            const room = rooms[roomId];
            if (room.players['p1'] && room.players['p1'].isBot) {
                botManager.deactivateBot(roomId);
                delete room.players['p1'];
            }
            if (room.players['p2'] && room.players['p2'].isBot) {
                botManager.deactivateBot(roomId);
                delete room.players['p2'];
            }

            const role = room.addPlayer(socket, playerName);
            socketToRoom[socket.id] = roomId;
            socket.join(roomId);

            // Send join confirmation
            socket.emit('joined_room', { roomId: roomId, role: role });

            // Send map
            io.to(roomId).emit('map_update', room.obstacles);

            // Broadcast names to everyone in room
            io.to(roomId).emit('update_names', room.getPlayerNames());
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('input', (key) => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const player = rooms[roomId].players[rooms[roomId].players['p1']?.id === socket.id ? 'p1' : 'p2'];
            if (player) {
                const result = player.applyInput(key);
                if (result === 'attack') {
                    // Emit swing event for visual animation (even on miss)
                    io.to(roomId).emit('event', { type: 'swing', player: player.isPlayer1 ? 'p1' : 'p2' });
                } else if (result && result.type === 'grenade') {
                    // Create grenade
                    const grenade = new Grenade(result.x, result.y, result.vx, result.vy, player.id);
                    rooms[roomId].grenades.push(grenade);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].removePlayer(socket.id);
            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
                botManager.deactivateBot(roomId);
            } else {
                // Notify remaining player that names might have changed (or waiting)
                io.to(roomId).emit('update_names', rooms[roomId].getPlayerNames());
                // Vérifier si un bot doit être activé
                botManager.checkRoom(rooms[roomId]);
            }
        }
        delete socketToRoom[socket.id];
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Export pour les modules bot (si nécessaire)
module.exports = {
    Player,
    Grenade,
    GameRoom,
    io,
    WIDTH,
    HEIGHT,
    GRAVITY,
    T_INC,
    R_MIN,
    R_MAX
};
