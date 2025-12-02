const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Game Constants
const WIDTH = 1920;
const HEIGHT = 1080;
const GRAVITY = 8;
const T_INC = 0.3;
const R_MIN = 25;
const R_MAX = 30;

// --- ROOM MANAGEMENT ---
const rooms = {}; // Map<roomId, GameRoom>
const socketToRoom = {}; // Map<socketId, roomId>

function generateRoomId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

class Player {
    constructor(id, isPlayer1) {
        this.id = id;
        this.isPlayer1 = isPlayer1;
        this.color = isPlayer1 ? '#9393D6' : '#CD62D5';
        this.damage = 0;
        this.score = 0;
        this.inputs = {};
        this.dashCooldown = 0;
        this.reset();
    }

    reset() {
        this.damage = 0;
        this.dashCooldown = 0;
        if (this.isPlayer1) {
            this.x = 100;
            this.y = 200;
            this.startX = 100;
            this.startY = 200;
            this.velocity = 0; // Start with no initial velocity
            this.angle = Math.PI / 2; // 90 degrees - vertical drop
        } else {
            this.x = 1820;
            this.y = 200;
            this.startX = 1820;
            this.startY = 200;
            this.velocity = 0; // Start with no initial velocity
            this.angle = Math.PI / 2; // 90 degrees - vertical drop
        }
        this.t = 0;
        this.isHit = false;
        this.hitCooldown = 0;
    }

    update(obstacles) {
        if (this.dashCooldown > 0) this.dashCooldown--;
        this.t += T_INC;

        let nextX = Math.cos(this.angle) * this.velocity * this.t + this.startX;
        let nextY = 0.5 * GRAVITY * this.t * this.t + Math.sin(this.angle) * this.velocity * this.t + this.startY;

        let collided = false;
        for (const obs of obstacles) {
            if (nextX + 25 > obs.x && nextX - 25 < obs.x + obs.w &&
                nextY + 25 > obs.y && nextY - 25 < obs.y + obs.h) {

                let currVx = Math.cos(this.angle) * this.velocity;
                let currVy = GRAVITY * this.t + Math.sin(this.angle) * this.velocity;

                let overlapLeft = (nextX + 25) - obs.x;
                let overlapRight = (obs.x + obs.w) - (nextX - 25);
                let overlapTop = (nextY + 25) - obs.y;
                let overlapBottom = (obs.y + obs.h) - (nextY - 25);

                let minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                const BOUNCE_DAMPING = 0.8;

                if (minOverlap === overlapLeft) {
                    currVx = -Math.abs(currVx) * BOUNCE_DAMPING;
                    this.startX = obs.x - 25;
                    this.startY = this.y;
                } else if (minOverlap === overlapRight) {
                    currVx = Math.abs(currVx) * BOUNCE_DAMPING;
                    this.startX = obs.x + obs.w + 25;
                    this.startY = this.y;
                } else if (minOverlap === overlapTop) {
                    currVy = -Math.abs(currVy) * BOUNCE_DAMPING;
                    this.startY = obs.y - 25;
                    this.startX = this.x;
                } else {
                    currVy = Math.abs(currVy) * BOUNCE_DAMPING;
                    this.startY = obs.y + obs.h + 25;
                    this.startX = this.x;
                }

                this.velocity = Math.sqrt(currVx * currVx + currVy * currVy);
                this.angle = Math.atan2(currVy, currVx);
                this.t = 0;
                this.x = this.startX;
                this.y = this.startY;
                collided = true;
                break;
            }
        }

        if (!collided) {
            this.x = nextX;
            this.y = nextY;
        }

        if (this.y > HEIGHT - 40) {
            this.y = HEIGHT - 40;
            this.startX = this.x;
            this.startY = this.y;
            this.t = 0;
        }

        if (this.x < -100 || this.x > WIDTH + 100 || this.y < -100) {
            return { dead: true, bounced: false };
        }
        return { dead: false, bounced: collided };
    }

    applyInput(key) {
        if (key === 'HIT') {
            this.isHit = true;
            setTimeout(() => this.isHit = false, 200);
            return;
        }

        if (key === 'DASH') {
            if (this.dashCooldown <= 0) {
                this.t = 0;
                this.startX = this.x;
                this.startY = this.y;
                this.velocity = -100; // Super speed
                this.dashCooldown = 60; // 1 second cooldown
                return 'dash';
            }
            return;
        }

        this.t = 0;
        this.startX = this.x;
        this.startY = this.y;
        this.velocity = -50;

        if (key === 'LEFT') this.angle = Math.PI / 3;
        else if (key === 'RIGHT') this.angle = 2 * Math.PI / 3;
        else if (key === 'UP') this.angle = Math.PI / 2;
    }

    getEjected(angleFromAttacker) {
        this.damage += 10;
        const force = 60 + (this.damage * 2);
        this.t = 0;
        this.startX = this.x;
        this.startY = this.y;
        this.velocity = -force;
        this.angle = angleFromAttacker;
    }
}

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = {};
        this.scores = { p1: 0, p2: 0 };
        this.obstacles = [];
        this.generateObstacles();
    }

    generateObstacles() {
        this.obstacles = [];
        for (let i = 0; i < 15; i++) {
            this.obstacles.push({
                x: Math.random() * (WIDTH - 200) + 100,
                y: Math.random() * (HEIGHT - 200) + 100,
                w: 50 + Math.random() * 100,
                h: 100 + Math.random() * 200,
            });
        }
        this.obstacles = this.obstacles.filter(o => {
            const p1Safe = (o.x + o.w < 50 || o.x > 250 || o.y + o.h < 150 || o.y > 350);
            const p2Safe = (o.x + o.w < 1750 || o.x > 1950 || o.y + o.h < 150 || o.y > 350);
            return p1Safe && p2Safe;
        });
    }

    addPlayer(socket) {
        if (!this.players['p1']) {
            this.players['p1'] = new Player(socket.id, true);
            return 'p1';
        } else if (!this.players['p2']) {
            this.players['p2'] = new Player(socket.id, false);
            return 'p2';
        }
        return 'spectator';
    }

    removePlayer(socketId) {
        if (this.players['p1'] && this.players['p1'].id === socketId) delete this.players['p1'];
        if (this.players['p2'] && this.players['p2'].id === socketId) delete this.players['p2'];
    }

    update() {
        const p1 = this.players['p1'];
        const p2 = this.players['p2'];

        if (p1 && p2) {
            const p1Status = p1.update(this.obstacles);
            const p2Status = p2.update(this.obstacles);

            // Emit bounce events
            if (p1Status.bounced) {
                io.to(this.id).emit('event', { type: 'bounce', player: 'p1' });
            }
            if (p2Status.bounced) {
                io.to(this.id).emit('event', { type: 'bounce', player: 'p2' });
            }

            if (p1Status.dead) {
                this.scores.p2++;
                p1.reset();
                io.to(this.id).emit('score', this.scores);
                io.to(this.id).emit('event', { type: 'death', player: 'p1' });
            }
            if (p2Status.dead) {
                this.scores.p1++;
                p2.reset();
                io.to(this.id).emit('score', this.scores);
                io.to(this.id).emit('event', { type: 'death', player: 'p2' });
            }

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angleV1V2 = Math.atan2(dy, dx);

            if (p1.isHit && dist < 2 * R_MAX) {
                p2.getEjected(angleV1V2);
                p1.isHit = false;
                io.to(this.id).emit('event', { type: 'hit', from: 'p1', to: 'p2', damage: p2.damage });
            }

            if (p2.isHit && dist < 2 * R_MAX) {
                p1.getEjected(angleV1V2 + Math.PI);
                p2.isHit = false;
                io.to(this.id).emit('event', { type: 'hit', from: 'p2', to: 'p1', damage: p1.damage });
            }
        }

        io.to(this.id).emit('state', {
            players: this.players,
            scores: this.scores
        });

        if (this.scores.p1 >= 10 || this.scores.p2 >= 10) {
            const winner = this.scores.p1 >= 10 ? 'p1' : 'p2';
            io.to(this.id).emit('game_over', { winner: winner });

            this.scores = { p1: 0, p2: 0 };
            if (p1) p1.reset();
            if (p2) p2.reset();
            io.to(this.id).emit('score', this.scores);

            this.generateObstacles();
            io.to(this.id).emit('map_update', this.obstacles);
        }
    }
}

// Game Loop
setInterval(() => {
    for (const roomId in rooms) {
        rooms[roomId].update();
    }
}, 1000 / 60);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', () => {
        const roomId = generateRoomId();
        rooms[roomId] = new GameRoom(roomId);
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;

        const slot = rooms[roomId].addPlayer(socket);
        socket.emit('init', { slot: slot, obstacles: rooms[roomId].obstacles, roomId: roomId });
        console.log(`Room ${roomId} created by ${socket.id}`);
    });

    socket.on('join_room', (roomId) => {
        roomId = roomId.toUpperCase();
        if (rooms[roomId]) {
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            const slot = rooms[roomId].addPlayer(socket);
            socket.emit('init', { slot: slot, obstacles: rooms[roomId].obstacles, roomId: roomId });
            console.log(`${socket.id} joined room ${roomId}`);
        } else {
            socket.emit('error_msg', 'Room not found');
        }
    });

    socket.on('input', (action) => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            let player = null;
            if (room.players['p1'] && room.players['p1'].id === socket.id) player = room.players['p1'];
            if (room.players['p2'] && room.players['p2'].id === socket.id) player = room.players['p2'];

            if (player) {
                player.applyInput(action);
            }
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].removePlayer(socket.id);
            // If room is empty, maybe delete it after a while? 
            // For now keep it simple.
            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
            }
        }
        delete socketToRoom[socket.id];
        console.log('User disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
