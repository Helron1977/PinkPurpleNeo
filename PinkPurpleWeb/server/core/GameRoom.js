const { WIDTH, HEIGHT, R_MAX } = require('../constants');
const Player = require('../entities/Player');
const Grenade = require('../entities/Grenade');

class GameRoom {
    constructor(id, io, botCallbacks) {
        this.id = id;
        this.io = io;
        this.botCallbacks = botCallbacks || { onEvent: () => { }, onGameEnd: () => { } };
        this.players = {};
        this.scores = { p1: 0, p2: 0 };
        this.obstacles = [];
        this.grenades = []; // Active grenades
        this.lastBroadcastState = null; // For delta compression
        this.globalHitStop = 0; // Global freeze timer
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

    addPlayer(socket, name) {
        if (!this.players['p1']) {
            this.players['p1'] = new Player(socket.id, true, name);
            return 'p1';
        } else if (!this.players['p2']) {
            this.players['p2'] = new Player(socket.id, false, name);
            return 'p2';
        }
        return 'spectator';
    }

    removePlayer(socketId) {
        if (this.players['p1'] && this.players['p1'].id === socketId) delete this.players['p1'];
        if (this.players['p2'] && this.players['p2'].id === socketId) delete this.players['p2'];
    }

    getPlayerNames() {
        return {
            p1: this.players['p1'] ? this.players['p1'].name : 'Waiting...',
            p2: this.players['p2'] ? this.players['p2'].name : 'Waiting...'
        };
    }

    updatePhysics() {
        if (this.globalHitStop > 0) {
            this.globalHitStop--;
            // On the last freeze frame, apply pending launches so they move next frame
            if (this.globalHitStop === 0) {
                if (this.players['p1']) this.players['p1'].applyPendingLaunch();
                if (this.players['p2']) this.players['p2'].applyPendingLaunch();
            }
            return;
        }

        const p1 = this.players['p1'];
        const p2 = this.players['p2'];

        if (p1 && p2) {
            const p1Status = p1.update(this.obstacles);
            const p2Status = p2.update(this.obstacles);

            // Emit bounce events
            if (p1Status.bounced) {
                this.io.to(this.id).emit('event', { type: 'bounce', player: 'p1' });
            }
            if (p2Status.bounced) {
                this.io.to(this.id).emit('event', { type: 'bounce', player: 'p2' });
            }

            if (p1Status.dead) {
                this.scores.p2++;
                p1.reset();
                this.io.to(this.id).emit('score', this.scores);
                const deathEvent = { type: 'death', player: 'p1' };
                this.io.to(this.id).emit('event', deathEvent);
                // Notifier les bots pour l'apprentissage
                this.botCallbacks.onEvent(this.id, deathEvent);
            }
            if (p2Status.dead) {
                this.scores.p1++;
                p2.reset();
                this.io.to(this.id).emit('score', this.scores);
                const deathEvent = { type: 'death', player: 'p2' };
                this.io.to(this.id).emit('event', deathEvent);
                // Notifier les bots pour l'apprentissage
                this.botCallbacks.onEvent(this.id, deathEvent);
            }

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angleV1V2 = Math.atan2(dy, dx);

            // Geometric Hit Detection
            const checkHit = (attacker, victim, dist, angleAttackToVictim) => {
                // 1. Range Check: Player Radius (25) + Bat Reach (~100) = 125
                if (dist > 140) return false; // Generous reach

                // 2. Angle Check (Cone)
                // Attacker Facing: 0 (Right) or PI (Left)
                const facingAngle = attacker.lastFacing === 1 ? 0 : Math.PI;

                // Angle Difference
                let diff = angleAttackToVictim - facingAngle;
                // Normalize to [-PI, PI]
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;

                // Cone width: +/- 60 degrees (~1.0 radian)
                return Math.abs(diff) < 1.2;
            };

            // Priority check: did P1 hit P2?
            let p1HitP2 = false;
            if (p1.isHit && checkHit(p1, p2, dist, angleV1V2)) {
                // CALCUL ANGLE D'ÉJECTION basé sur la direction réelle de la batte
                // Utiliser lastAction pour déterminer la direction de l'attaque
                let batAngle;
                if (p1.lastAction === 'UP') {
                    // Attaque vers le haut : angle vertical vers le haut
                    batAngle = -Math.PI / 2; // Vers le haut
                    // Ajuster légèrement selon la position relative
                    const horizontalOffset = Math.atan2(dx, Math.abs(dy)) * 0.3;
                    batAngle += horizontalOffset;
                } else {
                    // Attaque horizontale : direction basée sur facing
                    batAngle = p1.lastFacing === 1 ? 0 : Math.PI; // Direction horizontale de la batte
                    // Ajuster selon la position verticale de la victime
                    const verticalOffset = Math.atan2(dy, Math.abs(dx)); // Angle vertical relatif
                    // Combiner: direction de la batte + composante verticale
                    batAngle += Math.max(-Math.PI / 3, Math.min(Math.PI / 3, verticalOffset * 0.5));
                }
                const ejectionAngle = batAngle;
                
                p2.prepareEjection(ejectionAngle); // Prepare Launch avec angle corrigé
                p1.enterVictoryStance(); // ATTACKER FLOATS
                p1.isHit = false; // Consume hit

                // CRITICAL FIX: P2 is stunned, so they CANNOT attack P1 back in this frame
                p2.isHit = false;
                p2.activeHitboxTimer = 0;

                // GLOBAL FREEZE ON HIT
                this.globalHitStop = 30;

                const hitEvent = { type: 'hit', from: 'p1', to: 'p2', damage: p2.damage };
                this.io.to(this.id).emit('event', hitEvent);
                this.botCallbacks.onEvent(this.id, hitEvent);
                p1HitP2 = true;
            }

            // Only check P2 attack if P2 wasn't just stunned
            if (!p1HitP2 && p2.isHit) {
                const angleV2V1 = Math.atan2(-dy, -dx);
                if (checkHit(p2, p1, dist, angleV2V1)) {
                    // CALCUL ANGLE D'ÉJECTION basé sur la direction réelle de la batte
                    let batAngle;
                    if (p2.lastAction === 'UP') {
                        // Attaque vers le haut : angle vertical vers le haut
                        batAngle = -Math.PI / 2; // Vers le haut
                        // Ajuster légèrement selon la position relative
                        const horizontalOffset = Math.atan2(-dx, Math.abs(-dy)) * 0.3;
                        batAngle += horizontalOffset;
                    } else {
                        // Attaque horizontale : direction basée sur facing
                        batAngle = p2.lastFacing === 1 ? 0 : Math.PI;
                        const verticalOffset = Math.atan2(-dy, Math.abs(-dx));
                        batAngle += Math.max(-Math.PI / 3, Math.min(Math.PI / 3, verticalOffset * 0.5));
                    }
                    const ejectionAngle = batAngle;
                    
                    p1.prepareEjection(ejectionAngle); // Prepare Launch avec angle corrigé
                    p2.enterVictoryStance(); // ATTACKER FLOATS
                    p2.isHit = false; // Consume hit

                    // CRITICAL FIX: P1 is stunned
                    p1.isHit = false;
                    p1.activeHitboxTimer = 0;

                    // GLOBAL FREEZE ON HIT
                    this.globalHitStop = 30;

                    const hitEvent = { type: 'hit', from: 'p2', to: 'p1', damage: p1.damage };
                    this.io.to(this.id).emit('event', hitEvent);
                    this.botCallbacks.onEvent(this.id, hitEvent);
                }
            }
        }

        // Update grenades
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const grenade = this.grenades[i];

            // Sticky Logic
            if (grenade.attachedTo) {
                const target = this.players[grenade.attachedTo];
                if (target) {
                    grenade.x = target.x;
                    grenade.y = target.y;
                    grenade.startX = target.x;
                    grenade.startY = target.y;
                    grenade.age++; // Still age while stuck
                } else {
                    grenade.attachedTo = null; // Target disconnected/died
                }
            } else {
                // Normal physics
                grenade.update(this.obstacles);

                // Check collision with players for Sticking
                // User requirement: Stuck to Opponent
                const checkStick = (pid) => {
                    const p = this.players[pid];
                    if (p && grenade.owner !== p.id) { // Only stick to non-owner (opponent)
                        const dx = p.x - grenade.x;
                        const dy = p.y - grenade.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 40) { // Player Radius (25) + Grenade Radius (12.5) approx
                            grenade.attachedTo = pid;
                        }
                    }
                };

                // We don't know who is P1/P2 by ID easily in the loop, but players map keys are 'p1', 'p2'
                if (this.players['p1']) checkStick('p1');
                if (this.players['p2']) checkStick('p2');
            }

            // Check if grenade exploded
            if (grenade.exploded || grenade.age >= 60) {
                // Explosion! Check for players in blast radius
                const BLAST_RADIUS = 12.5 * 6; // 6x grenade size

                if (p1) {
                    const dx1 = p1.x - grenade.x;
                    const dy1 = p1.y - grenade.y;
                    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    if (dist1 < BLAST_RADIUS) {
                        const angle1 = Math.atan2(dy1, dx1);
                        p1.prepareEjection(angle1); // Use new method
                        this.globalHitStop = 30; // FREEZE ON EXPLOSION
                        const grenadeHitEvent = {
                            type: 'grenade_hit',
                            target: 'p1',
                            damage: p1.damage
                        };
                        this.io.to(this.id).emit('event', grenadeHitEvent);
                        this.botCallbacks.onEvent(this.id, grenadeHitEvent);
                    }
                }

                if (p2) {
                    const dx2 = p2.x - grenade.x;
                    const dy2 = p2.y - grenade.y;
                    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    if (dist2 < BLAST_RADIUS) {
                        const angle2 = Math.atan2(dy2, dx2);
                        p2.prepareEjection(angle2); // Use new method
                        this.globalHitStop = 30; // FREEZE ON EXPLOSION
                        const grenadeHitEvent = {
                            type: 'grenade_hit',
                            target: 'p2',
                            damage: p2.damage
                        };
                        this.io.to(this.id).emit('event', grenadeHitEvent);
                        this.botCallbacks.onEvent(this.id, grenadeHitEvent);
                    }
                }

                // Emit explosion event for client rendering
                const explodeEvent = {
                    type: 'grenade_explode',
                    x: Math.round(grenade.x),
                    y: Math.round(grenade.y),
                    radius: BLAST_RADIUS
                };
                this.io.to(this.id).emit('event', explodeEvent);
                this.botCallbacks.onEvent(this.id, explodeEvent);

                // Remove grenade
                this.grenades.splice(i, 1);
            }
        }

        if (this.scores.p1 >= 10 || this.scores.p2 >= 10) {
            const winner = this.scores.p1 >= 10 ? 'p1' : 'p2';
            this.io.to(this.id).emit('game_over', { winner: winner });

            // Notifier les bots de la fin de partie pour l'apprentissage
            this.botCallbacks.onGameEnd(this.id, winner);

            this.scores = { p1: 0, p2: 0 };
            if (p1) p1.reset();
            if (p2) p2.reset();
            this.io.to(this.id).emit('score', this.scores);

            this.generateObstacles();
            this.io.to(this.id).emit('map_update', this.obstacles);
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

            // Flags: Bit 0 (Active), Bit 1 (IsHit), Bits 2-3 (GrenadeCount), Bit 4 (Facing), Bit 5 (VictoryStance)
            let flags = 1; // Active
            if (p.isHit) flags |= 2;
            flags |= (p.grenadeCount & 0x03) << 2; // 2 bits for grenades (0-3)
            if (p.lastFacing === 1) flags |= 16; // Bit 4: Facing (0=Left, 1=Right)
            if (p.victoryStance) flags |= 32; // Bit 5: VictoryStance

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

        this.io.to(this.id).emit('state_bin', buf);
    }
}

module.exports = GameRoom;
