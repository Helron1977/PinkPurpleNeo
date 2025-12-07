const { WIDTH, HEIGHT, R_MAX } = require('../constants');
const Player = require('../entities/Player');
const Grenade = require('../entities/Grenade');
const SimplifiedRagdollService = require('../physics/SimplifiedRagdollService');

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

        // Ragdoll service
        this.ragdollService = new SimplifiedRagdollService({
            gravity: 8,
            timeStep: 1 / 60
        });

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
            // Créer ragdoll pour P1
            this.ragdollService.createRagdoll(socket.id, this.players['p1'].x, this.players['p1'].y, true);
            return 'p1';
        } else if (!this.players['p2']) {
            this.players['p2'] = new Player(socket.id, false, name);
            // Créer ragdoll pour P2
            this.ragdollService.createRagdoll(socket.id, this.players['p2'].x, this.players['p2'].y, false);
            return 'p2';
        }
        return 'spectator';
    }

    removePlayer(socketId) {
        if (this.players['p1'] && this.players['p1'].id === socketId) {
            this.ragdollService.destroyRagdoll(socketId);
            delete this.players['p1'];
        }
        if (this.players['p2'] && this.players['p2'].id === socketId) {
            this.ragdollService.destroyRagdoll(socketId);
            delete this.players['p2'];
        }
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

        // Update ragdoll physics
        this.ragdollService.update(1 / 60);

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
                // IMPROVED EJECTION ANGLE CALCULATION
                // L'animation de la batte fait un arc de cercle de bas en haut (facing right) 
                // ou de haut en bas (facing left)
                // L'angle d'éjection doit être perpendiculaire à la batte au moment de l'impact

                const facing = p1.lastFacing; // 1 = right, -1 = left

                // Position relative de la victime par rapport à l'attaquant
                const relativeY = dy; // Positif si victime est en bas, négatif si en haut

                // Calculer l'angle de la batte au moment de l'impact
                // L'animation fait un arc: de -45° (repos) à +90° (impact) pour facing right
                // Pour facing left, c'est l'inverse
                let batSwingAngle;

                if (facing === 1) {
                    // Mouvement de gauche à droite: arc de bas en haut
                    // Si victime en bas (relativeY > 0): batte à ~45° (bas-droite vers haut-droite)
                    // Si victime en haut (relativeY < 0): batte à ~135° (haut-droite)
                    batSwingAngle = Math.PI / 4 + (relativeY / dist) * (Math.PI / 3);
                } else {
                    // Mouvement de droite à gauche: arc de haut en bas
                    // Si victime en haut (relativeY < 0): batte à ~45° (haut-gauche vers bas-gauche)
                    // Si victime en bas (relativeY > 0): batte à ~-45° (bas-gauche)
                    batSwingAngle = Math.PI - Math.PI / 4 - (relativeY / dist) * (Math.PI / 3);
                }

                // L'angle d'éjection est perpendiculaire à la batte (+ 90°)
                const ejectionAngle = batSwingAngle;

                p2.prepareEjection(ejectionAngle);
                p1.enterVictoryStance();
                p1.isHit = false;

                // ACTIVER RAGDOLL pour P2
                const contactPoint = {
                    x: p2.x + Math.cos(ejectionAngle) * 25,
                    y: p2.y + Math.sin(ejectionAngle) * 25
                };
                this.ragdollService.applyImpact(
                    p2.id,
                    ejectionAngle,
                    p2.damage * 1.5,  // Force basée sur dégâts
                    contactPoint
                );

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
                    // IMPROVED EJECTION ANGLE CALCULATION (same logic as P1)
                    const facing = p2.lastFacing; // 1 = right, -1 = left

                    // Position relative de la victime par rapport à l'attaquant
                    const relativeY = -dy; // Inverse car on regarde de P2 vers P1

                    // Calculer l'angle de la batte au moment de l'impact
                    let batSwingAngle;

                    if (facing === 1) {
                        // Mouvement de gauche à droite: arc de bas en haut
                        batSwingAngle = Math.PI / 4 + (relativeY / dist) * (Math.PI / 3);
                    } else {
                        // Mouvement de droite à gauche: arc de haut en bas
                        batSwingAngle = Math.PI - Math.PI / 4 - (relativeY / dist) * (Math.PI / 3);
                    }

                    // L'angle d'éjection est perpendiculaire à la batte
                    const ejectionAngle = batSwingAngle;

                    p1.prepareEjection(ejectionAngle);
                    p2.enterVictoryStance();
                    p2.isHit = false;

                    // ACTIVER RAGDOLL pour P1
                    const contactPoint = {
                        x: p1.x + Math.cos(ejectionAngle) * 25,
                        y: p1.y + Math.sin(ejectionAngle) * 25
                    };
                    this.ragdollService.applyImpact(
                        p1.id,
                        ejectionAngle,
                        p1.damage * 1.5,
                        contactPoint
                    );

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
        // DELTA COMPRESSION: Send full state every 10 frames, delta otherwise
        if (!this.frameCounter) this.frameCounter = 0;
        this.frameCounter++;

        const sendFullState = (this.frameCounter % 10 === 0);

        if (sendFullState) {
            this.broadcastFullState();
        } else {
            this.broadcastDeltaState();
        }
    }

    broadcastFullState() {
        // BINARY PROTOCOL - FULL STATE
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
                buf.writeUInt8(0, offset);
                offset += 6;
                return;
            }

            let flags = 1; // Active
            if (p.isHit) flags |= 2;
            flags |= (p.grenadeCount & 0x03) << 2;
            if (p.lastFacing === 1) flags |= 16;
            if (p.victoryStance) flags |= 32;

            buf.writeUInt8(flags, offset++);
            buf.writeUInt8(p.damage, offset++);
            buf.writeInt16LE(Math.round(p.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(p.y * 10), offset); offset += 2;
        };

        let p1Id = null, p2Id = null;
        for (const id in this.players) {
            if (this.players[id].isPlayer1) p1Id = id;
            else p2Id = id;
        }

        writePlayer(p1Id);
        writePlayer(p2Id);

        buf.writeUInt8(grenadeCount, offset++);
        for (const g of this.grenades) {
            buf.writeInt16LE(Math.round(g.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(g.y * 10), offset); offset += 2;
            buf.writeUInt8(Math.min(255, g.age), offset++);
        }

        // Save for delta comparison
        this.lastState = {
            p1: p1Id ? { x: this.players[p1Id].x, y: this.players[p1Id].y } : null,
            p2: p2Id ? { x: this.players[p2Id].x, y: this.players[p2Id].y } : null
        };

        this.io.to(this.id).emit('state_bin', buf);
    }

    broadcastDeltaState() {
        // DELTA STATE: Only send positions that changed significantly (>5px)
        let p1Id = null, p2Id = null;
        for (const id in this.players) {
            if (this.players[id].isPlayer1) p1Id = id;
            else p2Id = id;
        }

        const p1 = p1Id ? this.players[p1Id] : null;
        const p2 = p2Id ? this.players[p2Id] : null;

        // Check if positions changed significantly
        const p1Changed = p1 && this.lastState?.p1 &&
            (Math.abs(p1.x - this.lastState.p1.x) > 5 || Math.abs(p1.y - this.lastState.p1.y) > 5);
        const p2Changed = p2 && this.lastState?.p2 &&
            (Math.abs(p2.x - this.lastState.p2.x) > 5 || Math.abs(p2.y - this.lastState.p2.y) > 5);

        // If nothing changed significantly, don't send anything
        if (!p1Changed && !p2Changed && this.grenades.length === 0) {
            return;
        }

        // Compact delta format: [flags(1)] [p1_x(2)] [p1_y(2)] [p2_x(2)] [p2_y(2)] [grenades...]
        const grenadeCount = this.grenades.length;
        const bufferSize = 1 + (p1Changed ? 4 : 0) + (p2Changed ? 4 : 0) + 1 + (grenadeCount * 5);
        const buf = Buffer.alloc(bufferSize);
        let offset = 0;

        // Flags: bit 0 = p1 included, bit 1 = p2 included
        let flags = 0;
        if (p1Changed) flags |= 1;
        if (p2Changed) flags |= 2;
        buf.writeUInt8(flags, offset++);

        if (p1Changed) {
            buf.writeInt16LE(Math.round(p1.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(p1.y * 10), offset); offset += 2;
            this.lastState.p1 = { x: p1.x, y: p1.y };
        }

        if (p2Changed) {
            buf.writeInt16LE(Math.round(p2.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(p2.y * 10), offset); offset += 2;
            this.lastState.p2 = { x: p2.x, y: p2.y };
        }

        // Always include grenades if present
        buf.writeUInt8(grenadeCount, offset++);
        for (const g of this.grenades) {
            buf.writeInt16LE(Math.round(g.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(g.y * 10), offset); offset += 2;
            buf.writeUInt8(Math.min(255, g.age), offset++);
        }

        this.io.to(this.id).emit('state_delta', buf);
    }
}

module.exports = GameRoom;
