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

        const p1 = this.players['p1'];
        const p2 = this.players['p2'];

        if (p1 && p2) {
            // Threads et Webs sont maintenant dans le binaire broadcastState
            // Plus besoin d'envoyer des événements 'thread_update' ou 'web_update'
            
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
                // Réinitialiser la toile d'araignée du gagnant à chaque victoire
                p2.webAvailable = true;
                p2.webActive = null;
                this.io.to(this.id).emit('score', this.scores);
                const deathEvent = { type: 'death', player: 'p1' };
                this.io.to(this.id).emit('event', deathEvent);
                // Notifier les bots pour l'apprentissage
                this.botCallbacks.onEvent(this.id, deathEvent);
            }
            if (p2Status.dead) {
                this.scores.p1++;
                p2.reset();
                // Réinitialiser la toile d'araignée du gagnant à chaque victoire
                p1.webAvailable = true;
                p1.webActive = null;
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
                if (p1.currentAttackDirection === 'up') {
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
                
                // Calcul du multiplicateur de combo
                let comboMultiplier = 1.0;
                if (p1.attackCombo >= 2) {
                    comboMultiplier = 2.0; // Attaque*2 = sortie possible
                } else if (p1.dashAttackCombo) {
                    comboMultiplier = 1.8; // Dash+attaque = sortie possible
                }
                
                p2.prepareEjection(ejectionAngle, comboMultiplier); // Prepare Launch avec angle corrigé et combo
                p1.enterVictoryStance(); // ATTACKER FLOATS
                p1.isHit = false; // Consume hit
                p1.dashAttackCombo = false; // Reset combo

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
                    if (p2.currentAttackDirection === 'up') {
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
                    
                    // Calcul du multiplicateur de combo
                    let comboMultiplier = 1.0;
                    if (p2.attackCombo >= 2) {
                        comboMultiplier = 2.0; // Attaque*2 = sortie possible
                    } else if (p2.dashAttackCombo) {
                        comboMultiplier = 1.8; // Dash+attaque = sortie possible
                    }
                    
                    p1.prepareEjection(ejectionAngle, comboMultiplier); // Prepare Launch avec angle corrigé et combo
                    p2.enterVictoryStance(); // ATTACKER FLOATS
                    p2.isHit = false; // Consume hit
                    p2.dashAttackCombo = false; // Reset combo

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

            // Détection collision fil/grappin
            if (p1.threadActive) {
                const dx = p2.x - p1.threadActive.x;
                const dy = p2.y - p1.threadActive.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 30) {
                    // Touché ! Effet de taille
                    p2.sizeMultiplier = 0.85; // Victime plus petite
                    p2.sizeEffectTimer = 300; // 5 secondes
                    p1.sizeMultiplier = 1.15; // Attaquant plus gros
                    p1.sizeEffectTimer = 300; // 5 secondes
                    p1.threadActive = null;
                    this.io.to(this.id).emit('event', { 
                        type: 'thread_hit', 
                        from: 'p1', 
                        to: 'p2',
                        fromSize: 1.15,
                        toSize: 0.85
                    });
                }
            }
            if (p2.threadActive) {
                const dx = p1.x - p2.threadActive.x;
                const dy = p1.y - p2.threadActive.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 30) {
                    // Touché ! Effet de taille
                    p1.sizeMultiplier = 0.85; // Victime plus petite
                    p1.sizeEffectTimer = 300; // 5 secondes
                    p2.sizeMultiplier = 1.15; // Attaquant plus gros
                    p2.sizeEffectTimer = 300; // 5 secondes
                    p2.threadActive = null;
                    this.io.to(this.id).emit('event', { 
                        type: 'thread_hit', 
                        from: 'p2', 
                        to: 'p1',
                        fromSize: 1.15,
                        toSize: 0.85
                    });
                }
            }
            
            // Détection collision toile d'araignée
            if (p1.webActive) {
                const dx = p2.x - p1.webActive.x;
                const dy = p2.y - p1.webActive.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < p1.webActive.radius + 25) { // Rayon + rayon joueur
                    // Touché par la toile ! Ralentissement
                    p2.moveCooldown = Math.max(p2.moveCooldown, 180); // 3 secondes de ralentissement
                    this.io.to(this.id).emit('event', { 
                        type: 'web_hit', 
                        from: 'p1', 
                        to: 'p2'
                    });
                }
            }
            if (p2.webActive) {
                const dx = p1.x - p2.webActive.x;
                const dy = p1.y - p2.webActive.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < p2.webActive.radius + 25) { // Rayon + rayon joueur
                    // Touché par la toile ! Ralentissement
                    p1.moveCooldown = Math.max(p1.moveCooldown, 180); // 3 secondes de ralentissement
                    this.io.to(this.id).emit('event', { 
                        type: 'web_hit', 
                        from: 'p2', 
                        to: 'p1'
                    });
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
            const winnerPlayer = this.players[winner];
            
            // Animation de victoire centrée sur le gagnant
            if (winnerPlayer) {
                this.io.to(this.id).emit('event', { 
                    type: 'victory_animation', 
                    player: winner,
                    x: winnerPlayer.x,
                    y: winnerPlayer.y
                });
            }
            
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
