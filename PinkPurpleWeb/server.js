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

// Serve static files
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

// Grenade class with same physics as Player
class Grenade {
    constructor(x, y, vx, vy, owner) {
        this.id = Math.random().toString(36).substring(2, 9);
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.velocity = Math.sqrt(vx * vx + vy * vy);
        this.angle = Math.atan2(vy, vx);
        this.t = 0;
        this.owner = owner; // ID of player who threw it
        this.age = 0; // Timer in frames
        this.exploded = false;
    }

    update(obstacles) {
        this.age++;
        this.t += T_INC;

        // Same physics as Player
        const vx = Math.cos(this.angle) * this.velocity;
        const vy = Math.sin(this.angle) * this.velocity;

        let nextX = this.startX + vx * this.t;
        let nextY = this.startY + vy * this.t + 0.5 * GRAVITY * this.t * this.t;

        // Collision detection
        let collided = false;
        const GRENADE_RADIUS = 12.5; // Half the size of player

        for (const obs of obstacles) {
            if (nextX + GRENADE_RADIUS > obs.x && nextX - GRENADE_RADIUS < obs.x + obs.w &&
                nextY + GRENADE_RADIUS > obs.y && nextY - GRENADE_RADIUS < obs.y + obs.h) {

                let currVx = vx;
                let currVy = vy + GRAVITY * this.t;

                let overlapLeft = (nextX + GRENADE_RADIUS) - obs.x;
                let overlapRight = (obs.x + obs.w) - (nextX - GRENADE_RADIUS);
                let overlapTop = (nextY + GRENADE_RADIUS) - obs.y;
                let overlapBottom = (obs.y + obs.h) - (nextY - GRENADE_RADIUS);

                let minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                const BOUNCE_DAMPING = 0.7; // Slightly less bouncy than players

                if (minOverlap === overlapLeft) {
                    currVx = -Math.abs(currVx) * BOUNCE_DAMPING;
                    nextX = obs.x - GRENADE_RADIUS;
                } else if (minOverlap === overlapRight) {
                    currVx = Math.abs(currVx) * BOUNCE_DAMPING;
                    nextX = obs.x + obs.w + GRENADE_RADIUS;
                } else if (minOverlap === overlapTop) {
                    currVy = -Math.abs(currVy) * BOUNCE_DAMPING;
                    nextY = obs.y - GRENADE_RADIUS;
                } else {
                    currVy = Math.abs(currVy) * BOUNCE_DAMPING;
                    nextY = obs.y + obs.h + GRENADE_RADIUS;
                }

                this.startX = nextX;
                this.startY = nextY;
                this.velocity = Math.sqrt(currVx * currVx + currVy * currVy);
                this.angle = Math.atan2(currVy, currVx);
                this.t = 0;

                collided = true;
                break;
            }
        }

        if (!collided) {
            this.x = nextX;
            this.y = nextY;
        } else {
            this.x = this.startX;
            this.y = this.startY;
        }

        // Ground collision
        if (this.y > HEIGHT - 40) {
            this.y = HEIGHT - 40;
            this.startX = this.x;
            this.startY = this.y;
            this.velocity *= 0.7; // Lose energy on ground bounce
            this.angle = Math.atan2(-Math.abs(Math.sin(this.angle)) * 0.7, Math.cos(this.angle) * 0.7);
            this.t = 0;
        }

        // Explode after 60 frames (1 second)
        if (this.age >= 60) {
            this.exploded = true;
        }

        // Out of bounds
        if (this.x < -100 || this.x > WIDTH + 100 || this.y < -100) {
            this.exploded = true; // Remove if out of bounds
        }
    }
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
        this.slamActiveTimer = 0; // Timer for slam attack hitbox
        this.moveCooldown = 0; // Cooldown preventing movement (e.g. after slam)
        this.grenadeCount = 3; // Start with 3 grenades per life
        this.reset();
    }

    reset() {
        this.damage = 0;
        this.dashCooldown = 0;
        this.slamActiveTimer = 0;
        this.moveCooldown = 0;
        this.grenadeCount = 3; // Reset grenades on respawn
        if (this.isPlayer1) {
            this.x = 100;
            this.y = 200;
            this.startX = 100;
            this.startY = 200;
            this.velocity = 0;
            this.angle = Math.PI / 2; // 90 degrees - vertical drop
        } else {
            this.x = 1820;
            this.y = 200;
            this.startX = 1820;
            this.startY = 1200;
            this.velocity = 0;
            this.angle = Math.PI / 2; // 90 degrees - vertical drop
        }
        this.t = 0;
        this.isHit = false;
    }

    update(obstacles) {
        // Update cooldowns
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.moveCooldown > 0) this.moveCooldown--;

        // Update slam attack timer (active hitbox for first 0.5s)
        if (this.slamActiveTimer > 0) {
            this.slamActiveTimer--;
            if (this.slamActiveTimer === 0) {
                this.isHit = false; // Deactivate hitbox after timer
            }
        }

        // Increment time for trajectory
        this.t += T_INC;

        // Calculate next position using physics equation
        // x(t) = x0 + vx * t
        // y(t) = y0 + vy * t + 0.5 * g * t²
        const vx = Math.cos(this.angle) * this.velocity;
        const vy = Math.sin(this.angle) * this.velocity;

        let nextX = this.startX + vx * this.t;
        let nextY = this.startY + vy * this.t + 0.5 * GRAVITY * this.t * this.t;

        // Collision detection and resolution
        let collided = false;
        const PLAYER_RADIUS = 25;

        for (const obs of obstacles) {
            // AABB collision detection
            if (nextX + PLAYER_RADIUS > obs.x && nextX - PLAYER_RADIUS < obs.x + obs.w &&
                nextY + PLAYER_RADIUS > obs.y && nextY - PLAYER_RADIUS < obs.y + obs.h) {

                // Calculate current velocity at time of collision
                let currVx = vx;
                let currVy = vy + GRAVITY * this.t;

                // Determine collision side using penetration depth
                let overlapLeft = (nextX + PLAYER_RADIUS) - obs.x;
                let overlapRight = (obs.x + obs.w) - (nextX - PLAYER_RADIUS);
                let overlapTop = (nextY + PLAYER_RADIUS) - obs.y;
                let overlapBottom = (obs.y + obs.h) - (nextY - PLAYER_RADIUS);

                let minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                const BOUNCE_DAMPING = 0.8;

                // Resolve collision based on minimum penetration
                if (minOverlap === overlapLeft) {
                    // Collision from right
                    currVx = -Math.abs(currVx) * BOUNCE_DAMPING;
                    nextX = obs.x - PLAYER_RADIUS;
                } else if (minOverlap === overlapRight) {
                    // Collision from left
                    currVx = Math.abs(currVx) * BOUNCE_DAMPING;
                    nextX = obs.x + obs.w + PLAYER_RADIUS;
                } else if (minOverlap === overlapTop) {
                    // Collision from bottom
                    currVy = -Math.abs(currVy) * BOUNCE_DAMPING;
                    nextY = obs.y - PLAYER_RADIUS;
                } else {
                    // Collision from top
                    currVy = Math.abs(currVy) * BOUNCE_DAMPING;
                    nextY = obs.y + obs.h + PLAYER_RADIUS;
                }

                // Reset trajectory from collision point
                this.startX = nextX;
                this.startY = nextY;
                this.velocity = Math.sqrt(currVx * currVx + currVy * currVy);
                this.angle = Math.atan2(currVy, currVx);
                this.t = 0;

                collided = true;
                break;
            }
        }

        // Update position
        if (!collided) {
            this.x = nextX;
            this.y = nextY;
        } else {
            this.x = this.startX;
            this.y = this.startY;
        }

        // Ground collision
        if (this.y > HEIGHT - 40) {
            this.y = HEIGHT - 40;

            // Slam Logic: Stick to ground
            if (this.slamActiveTimer > 0) {
                this.velocity = 0;
                this.angle = 0;
                this.t = 0;
                this.slamActiveTimer = 0;
                this.isHit = false;
                // Update start position to current position so next movement starts from here
                this.startX = this.x;
                this.startY = this.y;
                // Move cooldown is already set in applyInput
            } else {
                // Normal Bounce Logic
                // Calculate vertical component of velocity
                let vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;
                let vx = Math.cos(this.angle) * this.velocity;

                // Apply damping
                vy = -Math.abs(vy) * 0.6; // Bounce factor (0.6 = loses 40% energy)
                vx = vx * 0.8; // Friction

                // Resting Threshold (Prevent infinite micro-bounces)
                if (Math.abs(vy) < 8 && Math.abs(vx) < 2) {
                    this.velocity = 0;
                    this.angle = 0;
                } else {
                    // Re-calculate velocity and angle
                    this.velocity = Math.sqrt(vx * vx + vy * vy);
                    this.angle = Math.atan2(vy, vx);
                }

                this.startX = this.x;
                this.startY = this.y;
                this.t = 0;
            }
        }

        // Death boundary check
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

        // Prevent movement if on cooldown (e.g. recovering from slam)
        if (this.moveCooldown > 0) return;

        if (key === 'GRENADE') {
            if (this.grenadeCount > 0) {
                // Calculate current velocity
                const vx = Math.cos(this.angle) * this.velocity;
                const vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;

                this.grenadeCount--;
                return {
                    type: 'grenade',
                    x: this.x,
                    y: this.y,
                    vx: vx,
                    vy: vy
                };
            }
            return;
        }

        if (key === 'SLAM') {
            // Slam: vertical downward trajectory with high initial velocity
            this.t = 0;
            this.startX = this.x;
            this.startY = this.y;
            this.velocity = 80; // High downward velocity
            this.angle = Math.PI / 2; // Straight down (90°)
            this.slamActiveTimer = 30; // Attack active for 0.5s (30 frames at 60fps)
            this.moveCooldown = 60; // Cannot move for 1 second
            this.isHit = true;
            return 'slam';
        }

        if (key === 'DASH') {
            if (this.dashCooldown <= 0) {
                // Dash: horizontal trajectory with very high initial velocity
                this.t = 0;
                this.startX = this.x;
                this.startY = this.y;
                this.velocity = -120; // Very high horizontal velocity
                // Maintain current angle or use slight upward angle
                if (Math.abs(this.angle - Math.PI / 2) < 0.1) {
                    // If currently vertical, dash horizontally
                    this.angle = 0; // Horizontal
                }
                // Otherwise keep current angle
                this.dashCooldown = 60; // 1 second cooldown
                return 'dash';
            }
            return;
        }

        // Regular movements
        this.t = 0;
        this.startX = this.x;
        this.startY = this.y;
        this.velocity = -50;

        if (key === 'LEFT') this.angle = Math.PI / 3; // 60° up-left
        else if (key === 'RIGHT') this.angle = 2 * Math.PI / 3; // 120° up-right
        else if (key === 'UP') this.angle = Math.PI / 2; // 90° straight up
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
        this.grenades = []; // Active grenades
        this.lastBroadcastState = null; // For delta compression
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

    updatePhysics() {
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

        // Update grenades
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const grenade = this.grenades[i];
            grenade.update(this.obstacles);

            // Check if grenade exploded
            if (grenade.exploded) {
                // Explosion! Check for players in blast radius
                const BLAST_RADIUS = 12.5 * 6; // 6x grenade size

                if (p1) {
                    const dx1 = p1.x - grenade.x;
                    const dy1 = p1.y - grenade.y;
                    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    if (dist1 < BLAST_RADIUS) {
                        const angle1 = Math.atan2(dy1, dx1);
                        p1.getEjected(angle1);
                        io.to(this.id).emit('event', {
                            type: 'grenade_hit',
                            target: 'p1',
                            damage: p1.damage
                        });
                    }
                }

                if (p2) {
                    const dx2 = p2.x - grenade.x;
                    const dy2 = p2.y - grenade.y;
                    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    if (dist2 < BLAST_RADIUS) {
                        const angle2 = Math.atan2(dy2, dx2);
                        p2.getEjected(angle2);
                        io.to(this.id).emit('event', {
                            type: 'grenade_hit',
                            target: 'p2',
                            damage: p2.damage
                        });
                    }
                }

                // Emit explosion event for client rendering
                io.to(this.id).emit('event', {
                    type: 'grenade_explode',
                    x: Math.round(grenade.x),
                    y: Math.round(grenade.y),
                    radius: BLAST_RADIUS
                });

                // Remove grenade
                this.grenades.splice(i, 1);
            }
        }

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

    broadcastState() {
        // BINARY PROTOCOL
        // Schema:
        // [0] P1 Score (Uint8)
        // [1] P2 Score (Uint8)
        // [2-7] P1 Data (6 bytes)
        // [8-13] P2 Data (6 bytes)
        // [14] Grenade Count (Uint8)
        // [15+] Grenades (5 bytes each: X(2), Y(2), Age(1))

        const grenadeCount = this.grenades.length;
        const bufferSize = 2 + 6 + 6 + 1 + (grenadeCount * 5);
        const buf = Buffer.alloc(bufferSize);
        let offset = 0;

        // 1. Scores
        buf.writeUInt8(this.scores.p1, offset++);
        buf.writeUInt8(this.scores.p2, offset++);

        // Helper to write player
        const writePlayer = (pid) => {
            const p = this.players[pid];
            if (!p) {
                // Active flag = 0
                buf.writeUInt8(0, offset);
                offset += 6;
                return;
            }

            // Flags: Bit 0 (Active), Bit 1 (IsHit), Bits 2-3 (GrenadeCount)
            let flags = 1; // Active
            if (p.isHit) flags |= 2;
            flags |= (p.grenadeCount & 0x03) << 2; // 2 bits for grenades (0-3)

            buf.writeUInt8(flags, offset++);
            buf.writeUInt8(p.damage, offset++);

            // Coordinates x10 for precision, stored as Int16
            buf.writeInt16LE(Math.round(p.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(p.y * 10), offset); offset += 2;
        };

        // 2. Players (Always P1 then P2)
        // We need to find the actual IDs for P1 and P2.
        // The room stores players by socket ID, but the Player object has 'isPlayer1'
        let p1Id = null, p2Id = null;
        for (const id in this.players) {
            if (this.players[id].isPlayer1) p1Id = id;
            else p2Id = id;
        }

        writePlayer(p1Id);
        writePlayer(p2Id);

        // 3. Grenades
        buf.writeUInt8(grenadeCount, offset++);
        for (const g of this.grenades) {
            buf.writeInt16LE(Math.round(g.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(g.y * 10), offset); offset += 2;
            buf.writeUInt8(Math.min(255, g.age), offset++);
        }

        io.to(this.id).emit('state_bin', buf);
    }
}

// Game Loop
// Physics at 60Hz
setInterval(() => {
    for (const roomId in rooms) {
        rooms[roomId].updatePhysics();
    }
}, 1000 / 60);

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

    socket.on('create_room', () => {
        const roomId = generateRoomId();
        rooms[roomId] = new GameRoom(roomId);
        socket.emit('room_created', roomId);
    });

    socket.on('join_room', (roomId) => {
        roomId = roomId.toUpperCase();
        if (rooms[roomId]) {
            const role = rooms[roomId].addPlayer(socket);
            socketToRoom[socket.id] = roomId;
            socket.join(roomId);
            socket.emit('joined_room', { roomId: roomId, role: role });
            io.to(roomId).emit('map_update', rooms[roomId].obstacles);
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
                if (result && result.type === 'grenade') {
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
            }
        }
        delete socketToRoom[socket.id];
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
