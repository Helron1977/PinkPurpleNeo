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
        this.isGameOver = false;
        this.gameOverTimer = 0;
        this.generateObstacles();
    }

    generateObstacles() {
        this.obstacles = [];
        const centerX = WIDTH / 2;
        
        // Génération symétrique : 7 obstacles de chaque côté
        const leftObstacles = [];
        for (let i = 0; i < 7; i++) {
            const x = Math.random() * (centerX - 300) + 100;
            const y = Math.random() * (HEIGHT - 200) + 100;
            const w = 50 + Math.random() * 100;
            const h = 100 + Math.random() * 200;
            leftObstacles.push({ x, y, w, h });
        }
        
        // Filtrer pour éviter les zones de spawn
        const filteredLeft = leftObstacles.filter(o => {
            const p1Safe = (o.x + o.w < 50 || o.x > 250 || o.y + o.h < 150 || o.y > 350);
            return p1Safe;
        });
        
        // Créer les obstacles symétriques à droite
        for (const obs of filteredLeft) {
            // Ajouter l'obstacle gauche
            this.obstacles.push(obs);
            // Ajouter l'obstacle droit (symétrique)
            const rightX = WIDTH - (obs.x + obs.w);
            this.obstacles.push({
                x: rightX,
                y: obs.y,
                w: obs.w,
                h: obs.h
            });
        }
        
        // Filtrer pour éviter les zones de spawn P2
        this.obstacles = this.obstacles.filter(o => {
            const p2Safe = (o.x + o.w < 1750 || o.x > 1950 || o.y + o.h < 150 || o.y > 350);
            return p2Safe;
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

        // Game Over Logic
        if (this.isGameOver) {
            this.gameOverTimer--;
            if (this.gameOverTimer <= 0) {
                this.resetGame();
                this.isGameOver = false;
            }
            // Continue physics to allow dancing
        }

        const p1 = this.players['p1'];
        const p2 = this.players['p2'];

        if (p1 && p2) {
            const p1Status = p1.update(this.obstacles);
            const p2Status = p2.update(this.obstacles);

            // Optimisation: Early exit si les joueurs sont morts
            if (p1Status.dead) {
                this.handleDeath('p1', p1, p2);
                return; // Stop physics for this frame
            }
            if (p2Status.dead) {
                this.handleDeath('p2', p2, p1);
                return;
            }

            // Emit bounce events
            if (p1Status.bounced) this.io.to(this.id).emit('event', { type: 'bounce', player: 'p1' });
            if (p2Status.bounced) this.io.to(this.id).emit('event', { type: 'bounce', player: 'p2' });

            // Distance Squared (évite Math.sqrt)
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distSq = dx * dx + dy * dy;

            // Optimisation: Hit Detection seulement si proche (< 140px => 19600 sq px)
            if (distSq < 19600) {
                const dist = Math.sqrt(distSq); // sqrt seulement si nécessaire
                const angleV1V2 = Math.atan2(dy, dx);

                // Priority check: did P1 hit P2?
                let p1HitP2 = false;
                if (p1.isHit && this.checkHit(p1, p2, dist, angleV1V2)) {
                    this.resolveHit(p1, p2, dx, dy);
                    p1HitP2 = true;
                }

                // Only check P2 attack if P2 wasn't just stunned
                if (!p1HitP2 && p2.isHit) {
                    const angleV2V1 = Math.atan2(-dy, -dx);
                    if (this.checkHit(p2, p1, dist, angleV2V1)) {
                        this.resolveHit(p2, p1, -dx, -dy);
                    }
                }
            }

            // Ability Collisions (Optimized with distSq check first)
            this.checkAbilityCollisions(p1, p2, distSq, dx, dy);
        }

        this.updateGrenades(p1, p2);
        if (!this.isGameOver) {
            this.checkWinCondition();
        }
    }

    // Helper: Handle Death
    handleDeath(victimId, victim, killer) {
        // Freeze score if game is over
        if (!this.isGameOver) {
            this.scores[killer.isPlayer1 ? 'p1' : 'p2']++;
        }
        
        victim.reset();
        killer.webAvailable = true;
        killer.webActive = null;
        this.io.to(this.id).emit('score', this.scores);
        const deathEvent = { type: 'death', player: victimId };
        this.io.to(this.id).emit('event', deathEvent);
        this.botCallbacks.onEvent(this.id, deathEvent);
    }

    // Helper: Geometric Hit Check
    checkHit(attacker, victim, dist, angleAttackToVictim) {
        if (dist > 140) return false;
        
        // CORPS A CORPS : Si très proche, le coup touche presque tout le temps (180° devant)
        if (dist < 60) {
            // Pas de check d'angle strict, juste être vaguement "devant" (ou même 360 pour éviter frustration)
            // Soyons généreux : Auto-hit si collé
            return true;
        }

        const facingAngle = attacker.lastFacing === 1 ? 0 : Math.PI;
        let diff = angleAttackToVictim - facingAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        
        // Tolérance angulaire (Cone)
        return Math.abs(diff) < 1.2;
    }

    // Helper: Resolve Hit Logic
    resolveHit(attacker, victim, dx, dy) {
        let batAngle;
        if (attacker.currentAttackDirection === 'up') {
            batAngle = -Math.PI / 2;
            const horizontalOffset = Math.atan2(dx, Math.abs(dy)) * 0.3;
            batAngle += horizontalOffset;
        } else {
            batAngle = attacker.lastFacing === 1 ? 0 : Math.PI;
            const verticalOffset = Math.atan2(dy, Math.abs(dx));
            batAngle += Math.max(-Math.PI / 3, Math.min(Math.PI / 3, verticalOffset * 0.5));
        }
        
        let comboMultiplier = 1.0;
        if (attacker.attackCombo >= 2) comboMultiplier = 2.0;
        else if (attacker.dashAttackCombo) comboMultiplier = 1.8;
        
        victim.prepareEjection(batAngle, comboMultiplier);
        attacker.enterVictoryStance();
        attacker.isHit = false;
        attacker.dashAttackCombo = false;
        victim.isHit = false;
        victim.activeHitboxTimer = 0;
        this.globalHitStop = 30;

        const hitEvent = { type: 'hit', from: attacker.isPlayer1 ? 'p1' : 'p2', to: victim.isPlayer1 ? 'p1' : 'p2', damage: victim.damage };
        this.io.to(this.id).emit('event', hitEvent);
        this.botCallbacks.onEvent(this.id, hitEvent);
    }

    // Helper: Ability Collisions
    checkAbilityCollisions(p1, p2, distSq, dx, dy) {
        // Thread Check (< 30px => 900 sq)
        if (p1.threadActive || p2.threadActive) {
            // Need recalculation relative to thread position, not player
            if (p1.threadActive) {
                const tdx = p2.x - p1.threadActive.x;
                const tdy = p2.y - p1.threadActive.y;
                if (tdx*tdx + tdy*tdy < 900) {
                    this.applyThreadHit(p1, p2, 'p1', 'p2');
                }
            }
            if (p2.threadActive) {
                const tdx = p1.x - p2.threadActive.x;
                const tdy = p1.y - p2.threadActive.y;
                if (tdx*tdx + tdy*tdy < 900) {
                    this.applyThreadHit(p2, p1, 'p2', 'p1');
                }
            }
        }

        // Web Check
        if (p1.webActive) {
            const wdx = p2.x - p1.webActive.x;
            const wdy = p2.y - p1.webActive.y;
            const radius = p1.webActive.radius + 25;
            if (wdx*wdx + wdy*wdy < radius*radius) {
                p2.moveCooldown = Math.max(p2.moveCooldown, 180);
                this.io.to(this.id).emit('event', { type: 'web_hit', from: 'p1', to: 'p2', x: p2.x, y: p2.y });
            }
        }
        if (p2.webActive) {
            const wdx = p1.x - p2.webActive.x;
            const wdy = p1.y - p2.webActive.y;
            const radius = p2.webActive.radius + 25;
            if (wdx*wdx + wdy*wdy < radius*radius) {
                p1.moveCooldown = Math.max(p1.moveCooldown, 180);
                this.io.to(this.id).emit('event', { type: 'web_hit', from: 'p2', to: 'p1', x: p1.x, y: p1.y });
            }
        }
    }

    applyThreadHit(attacker, victim, fromId, toId) {
        victim.sizeMultiplier = 0.85;
        victim.sizeEffectTimer = 300;
        attacker.sizeMultiplier = 1.15;
        attacker.sizeEffectTimer = 300;
        attacker.threadActive = null;
        this.io.to(this.id).emit('event', { 
            type: 'thread_hit', from: fromId, to: toId, fromSize: 1.15, toSize: 0.85, x: victim.x, y: victim.y 
        });
    }

    updateGrenades(p1, p2) {
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const grenade = this.grenades[i];

            if (grenade.attachedTo) {
                const target = this.players[grenade.attachedTo];
                if (target) {
                    grenade.x = target.x;
                    grenade.y = target.y;
                    grenade.startX = target.x;
                    grenade.startY = target.y;
                    grenade.age++;
                } else {
                    grenade.attachedTo = null;
                }
            } else {
                grenade.update(this.obstacles);
                // Check Stick (Simple dist check)
                const checkStick = (pid) => {
                    const p = this.players[pid];
                    if (p && grenade.owner !== p.id) {
                        const dx = p.x - grenade.x;
                        const dy = p.y - grenade.y;
                        if (dx*dx + dy*dy < 1600) { // 40*40
                            grenade.attachedTo = pid;
                        }
                    }
                };
                if (p1) checkStick('p1');
                if (p2) checkStick('p2');
            }

            if (grenade.exploded || grenade.age >= 60) {
                const BLAST_RADIUS = 75; // 12.5 * 6
                const BLAST_SQ = BLAST_RADIUS * BLAST_RADIUS;

                const checkBlast = (player, pid) => {
                    if (!player) return;
                    const dx = player.x - grenade.x;
                    const dy = player.y - grenade.y;
                    if (dx*dx + dy*dy < BLAST_SQ) {
                        player.prepareEjection(Math.atan2(dy, dx));
                        this.globalHitStop = 30;
                        const evt = { type: 'grenade_hit', target: pid, damage: player.damage };
                        this.io.to(this.id).emit('event', evt);
                        this.botCallbacks.onEvent(this.id, evt);
                    }
                };

                checkBlast(p1, 'p1');
                checkBlast(p2, 'p2');

                const explodeEvent = {
                    type: 'grenade_explode',
                    x: Math.round(grenade.x),
                    y: Math.round(grenade.y),
                    radius: BLAST_RADIUS
                };
                this.io.to(this.id).emit('event', explodeEvent);
                this.botCallbacks.onEvent(this.id, explodeEvent);
                this.grenades.splice(i, 1);
            }
        }
    }

    checkWinCondition() {
        if (this.scores.p1 >= 10 || this.scores.p2 >= 10) {
            const winner = this.scores.p1 >= 10 ? 'p1' : 'p2';
            this.isGameOver = true;
            this.gameOverTimer = 180; // 3 seconds transition

            this.io.to(this.id).emit('game_over', { winner: winner });
            this.botCallbacks.onGameEnd(this.id, winner);
            
            // Trigger victory dance event
            this.io.to(this.id).emit('event', { type: 'victory_dance', player: winner });
        }
    }

    resetGame() {
        this.scores = { p1: 0, p2: 0 };
        if (this.players['p1']) this.players['p1'].reset();
        if (this.players['p2']) this.players['p2'].reset();
        this.io.to(this.id).emit('score', this.scores);
        this.generateObstacles();
        this.io.to(this.id).emit('map_update', this.obstacles);
    }

    broadcastState() {
        // BINARY PROTOCOL
        // Schema:
        // [0] P1 Score (Uint8)
        // [1] P2 Score (Uint8)
        // [2-?] P1 Data
        // [?-?] P2 Data
        // [?] Grenade Count (Uint8)
        // [?+] Grenades

        // Calcul dynamique de la taille du buffer
        // Base per player: 1 (Flags) + 1 (Damage) + 4 (Pos) = 6 bytes
        // + New: 1 (AbilityFlags)
        // + Thread: 4 bytes (X, Y) if active
        // + Web: 5 bytes (X, Y, Radius) if active
        
        let p1Size = 7;
        if (this.players['p1'] && this.players['p1'].threadActive) p1Size += 4;
        if (this.players['p1'] && this.players['p1'].webActive) p1Size += 5;

        let p2Size = 7;
        if (this.players['p2'] && this.players['p2'].threadActive) p2Size += 4;
        if (this.players['p2'] && this.players['p2'].webActive) p2Size += 5;

        const grenadeCount = this.grenades.length;
        const bufferSize = 2 + p1Size + p2Size + 1 + (grenadeCount * 5);
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
                // Skip the rest of the fixed size block (AbilityFlags included in skip logic? No, just skip main block)
                // Actually, if inactive, we just write 0 and client knows to skip?
                // Client expects fixed structure? Let's assume inactive player takes 1 byte (0) and we handle logic on client
                // BUT current client logic expects fixed offset skip. We need to be careful.
                // Let's keep the active flag = 0 but write generic empty data to maintain simpler parsing if possible,
                // OR better: Client reads flag, if 0, skips fixed amount.
                // For dynamic parts (thread/web), if player inactive, they don't exist.
                
                // Let's rewrite:
                // Flags (1)
                // If Flags & 1 (Active):
                //   Read Damage (1)
                //   Read Pos (4)
                //   Read AbilityFlags (1)
                //   If AbilityFlags & 1 (Thread): Read ThreadPos (4)
                //   If AbilityFlags & 2 (Web): Read WebPosRadius (5)
                
                offset++; // Advance past the 0 flag
                return;
            }

            // Flags: Bit 0 (Active), Bit 1 (IsHit), Bits 2-3 (GrenadeCount), Bit 4 (Facing), Bit 5 (VictoryStance), Bit 6 (IsRespawning)
            let flags = 1; // Active
            if (p.isHit) flags |= 2;
            flags |= (p.grenadeCount & 0x03) << 2;
            if (p.lastFacing === 1) flags |= 16;
            if (p.victoryStance) flags |= 32;
            if (p.isRespawning) flags |= 64;

            buf.writeUInt8(flags, offset++);
            buf.writeUInt8(p.damage, offset++);

            // Coordinates x10
            buf.writeInt16LE(Math.round(p.x * 10), offset); offset += 2;
            buf.writeInt16LE(Math.round(p.y * 10), offset); offset += 2;
            
            // Ability Flags
            let abilityFlags = 0;
            if (p.threadActive) abilityFlags |= 1;
            if (p.webActive) abilityFlags |= 2;
            buf.writeUInt8(abilityFlags, offset++);
            
            // Thread Data
            if (p.threadActive) {
                buf.writeInt16LE(Math.round(p.threadActive.x * 10), offset); offset += 2;
                buf.writeInt16LE(Math.round(p.threadActive.y * 10), offset); offset += 2;
            }
            
            // Web Data
            if (p.webActive) {
                buf.writeInt16LE(Math.round(p.webActive.x * 10), offset); offset += 2;
                buf.writeInt16LE(Math.round(p.webActive.y * 10), offset); offset += 2;
                buf.writeUInt8(Math.min(255, p.webActive.radius), offset++);
            }
        };

        // 2. Players (Always P1 then P2)
        // Need ID mapping
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
