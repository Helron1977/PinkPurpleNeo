const { WIDTH, HEIGHT, GRAVITY, T_INC } = require('../constants');

class Player {
    constructor(id, isPlayer1, name) {
        this.id = id;
        this.isPlayer1 = isPlayer1;
        this.name = name || (isPlayer1 ? "Player 1" : "Player 2");
        this.color = isPlayer1 ? '#9393D6' : '#CD62D5';
        this.damage = 0;
        this.score = 0;
        this.inputs = {};
        this.dashCooldown = 0;
        this.slamActiveTimer = 0;
        this.moveCooldown = 0;
        this.grenadeCount = 3;
        // Système de combos
        this.attackCombo = 0;
        this.lastAction = null;
        this.dashAttackCombo = false; // Dash suivi d'attaque
        // Système de fil/grappin
        this.threadCooldown = 0;
        this.grenadeCooldown = 0; // Added cooldown
        this.threadActive = null; // {x, y, vx, vy, age}
        // Système de toile d'araignée (une par vie)
        this.webAvailable = true;
        this.webActive = null; // {x, y, radius, age}
        // Effet de taille
        this.sizeMultiplier = 1.0;
        this.sizeEffectTimer = 0;

        // Direction de mouvement
        this.lastMovement = 'horizontal'; // 'horizontal' ou 'up'
        this.currentAttackDirection = 'horizontal'; // Stocke la direction de l'attaque en cours

        this.reset();
    }

    reset() {
        this.damage = 0;
        this.dashCooldown = 0;
        this.slamActiveTimer = 0;
        this.moveCooldown = 0;
        this.pendingLaunch = null;
        this.victoryStance = false; // Add victoryStance init
        this.grenadeCount = 3;
        // Respawn invincible et immobile
        this.isRespawning = true;
        this.respawnTimer = 180; // 3 secondes à 60 FPS
        this.isInvincible = true;
        if (this.isPlayer1) {
            this.x = 100;
            this.y = 200;
            this.startX = 100;
            this.startY = 200;
            this.velocity = 0;
            this.angle = Math.PI / 2;
        } else {
            this.x = 1820;
            this.y = 200;
            this.startX = 1820;
            this.startY = 200;
            this.velocity = 0;
            this.angle = Math.PI / 2;
        }
        this.t = 0;
        this.isHit = false;
        this.lastFacing = 1;
        // Reset combos et effets
        this.attackCombo = 0;
        this.lastAction = null;
        this.dashAttackCombo = false;
        this.threadActive = null;
        this.threadCooldown = 0;
        // La toile n'est PAS réinitialisée ici (seulement à chaque victoire)
        // this.webAvailable reste false si elle a été utilisée
        // this.webActive reste null
        this.sizeMultiplier = 1.0;
        this.sizeEffectTimer = 0;
        this.lastMovement = 'horizontal';
    }

    update(obstacles) {
        let slammed = false; // Init flag
        // Update cooldowns (ALWAYS UPDATE FIRST)
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.moveCooldown > 0) this.moveCooldown--;
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.threadCooldown > 0) this.threadCooldown--;
        if (this.grenadeCooldown > 0) this.grenadeCooldown--;

        // Update victory stance grace period
        if (this.victoryStanceTimer > 0) {
            this.victoryStanceTimer--;
            // Auto-exit victory stance after grace period if no input
            if (this.victoryStanceTimer === 0) {
                // Optionnel: On pourrait forcer la sortie ici, mais on attend l'input joueur normalement.
                // Le user a dit "bloque indéfiniment", donc le timer ne descendait pas.
            }
        }

        // Update effet de taille
        if (this.sizeEffectTimer > 0) {
            this.sizeEffectTimer--;
            if (this.sizeEffectTimer === 0) {
                this.sizeMultiplier = 1.0;
            }
        }

        // RESPAWN: Immobile et invincible pendant 3 secondes ou jusqu'à mouvement
        if (this.isRespawning) {
            this.velocity = 0;
            this.t = 0;
            if (this.respawnTimer > 0) {
                this.respawnTimer--;
            } else {
                this.isRespawning = false;
                this.isInvincible = false;
            }
            return { dead: false, bounced: false };
        }

        // VICTORY STANCE: Attacker floats until input
        if (this.victoryStance) {
            this.velocity = 0;
            this.t = 0;
            return { dead: false, bounced: false };
        }

        // Update fil/grappin
        if (this.threadActive) {
            this.threadActive.age++;
            this.threadActive.x += this.threadActive.vx;
            this.threadActive.y += this.threadActive.vy;
            // Limite de portée
            if (this.threadActive.age > 60 ||
                this.threadActive.x < 0 || this.threadActive.x > WIDTH ||
                this.threadActive.y < 0 || this.threadActive.y > HEIGHT) {
                this.threadActive = null;
            }
        }

        // Update toile d'araignée
        if (this.webActive) {
            this.webActive.age++;
            this.webActive.radius = Math.min(200, 50 + this.webActive.age * 2); // Grandit jusqu'à 200px
            // La toile dure 10 secondes (600 frames)
            if (this.webActive.age > 600) {
                this.webActive = null;
            }
        }

        // Reset combo si trop de temps passe
        if (this.attackCombo > 0 && this.lastAction !== 'HIT') {
            this.attackCombo = 0;
        }

        // Update slam attack timer (active hitbox for first 0.5s)
        if (this.slamActiveTimer > 0) {
            this.slamActiveTimer--;
            if (this.slamActiveTimer === 0) {
                this.isHit = false;
            }
        }

        // Update regular attack hitbox
        if (this.activeHitboxTimer > 0) {
            this.activeHitboxTimer--;
            if (this.activeHitboxTimer === 0) {
                this.isAttacking = false;
                this.isHit = false;
            }
        }

        // Increment time for trajectory
        this.t += T_INC;

        // Calculate next position using physics equation
        const vx = Math.cos(this.angle) * this.velocity;
        const vy = Math.sin(this.angle) * this.velocity;

        let nextX = this.startX + vx * this.t;
        let nextY = this.startY + vy * this.t + 0.5 * GRAVITY * this.t * this.t;

        // Collision detection and resolution
        let collided = false;
        const PLAYER_RADIUS = 25;

        for (const obs of obstacles) {
            // AABB detection
            if (nextX + PLAYER_RADIUS > obs.x && nextX - PLAYER_RADIUS < obs.x + obs.w &&
                nextY + PLAYER_RADIUS > obs.y && nextY - PLAYER_RADIUS < obs.y + obs.h) {

                let currVx = vx;
                let currVy = vy + GRAVITY * this.t;

                let overlapLeft = (nextX + PLAYER_RADIUS) - obs.x;
                let overlapRight = (obs.x + obs.w) - (nextX - PLAYER_RADIUS);
                let overlapTop = (nextY + PLAYER_RADIUS) - obs.y;
                let overlapBottom = (obs.y + obs.h) - (nextY - PLAYER_RADIUS);

                let minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                const BOUNCE_DAMPING = 0.8;

                if (minOverlap === overlapLeft) {
                    currVx = -Math.abs(currVx) * BOUNCE_DAMPING;
                    nextX = obs.x - PLAYER_RADIUS;
                } else if (minOverlap === overlapRight) {
                    currVx = Math.abs(currVx) * BOUNCE_DAMPING;
                    nextX = obs.x + obs.w + PLAYER_RADIUS;
                } else if (minOverlap === overlapTop) {
                    currVy = -Math.abs(currVy) * BOUNCE_DAMPING;
                    nextY = obs.y - PLAYER_RADIUS;
                } else {
                    currVy = Math.abs(currVy) * BOUNCE_DAMPING;
                    nextY = obs.y + obs.h + PLAYER_RADIUS;
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

        // Ground collision avec rebond
        if (this.y > HEIGHT - 40) {
            this.y = HEIGHT - 40;

            if (this.slamActiveTimer > 0) {
                this.velocity = 0;
                this.angle = 0;
                this.t = 0;
                this.slamActiveTimer = 0;
                this.isHit = false;
                this.startX = this.x;
                this.startY = this.y;
                slammed = true; // Slam Impact detected
            } else {
                let vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;
                let vx = Math.cos(this.angle) * this.velocity;

                // Rebond plus prononcé
                vy = -Math.abs(vy) * 0.75; // Augmenté de 0.6 à 0.75
                vx = vx * 0.85; // Légèrement augmenté

                if (Math.abs(vy) < 5 && Math.abs(vx) < 2) {
                    this.velocity = 0;
                    this.angle = 0;
                } else {
                    this.velocity = Math.sqrt(vx * vx + vy * vy);
                    this.angle = Math.atan2(vy, vx);
                }

                this.startX = this.x;
                this.startY = this.y;
                this.t = 0;
            }
        }

        // Murs latéraux avec dégâts
        const WALL_DAMAGE = 5;
        const WALL_DAMAGE_THRESHOLD = 50; // Si dégâts >= 50, on peut sortir
        const WALL_X_LEFT = 0;
        const WALL_X_RIGHT = WIDTH;

        if (this.x < WALL_X_LEFT + 25) {
            // Mur gauche
            if (!this.isInvincible && this.damage < WALL_DAMAGE_THRESHOLD) {
                this.damage += WALL_DAMAGE;
                this.x = WALL_X_LEFT + 25;
                // Rebond
                let vx = Math.cos(this.angle) * this.velocity;
                let vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;
                vx = Math.abs(vx) * 0.7; // Rebond vers la droite
                this.velocity = Math.sqrt(vx * vx + vy * vy);
                this.angle = Math.atan2(vy, vx);
                this.startX = this.x;
                this.startY = this.y;
                this.t = 0;
            }
        } else if (this.x > WALL_X_RIGHT - 25) {
            // Mur droit
            if (!this.isInvincible && this.damage < WALL_DAMAGE_THRESHOLD) {
                this.damage += WALL_DAMAGE;
                this.x = WALL_X_RIGHT - 25;
                // Rebond
                let vx = Math.cos(this.angle) * this.velocity;
                let vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;
                vx = -Math.abs(vx) * 0.7; // Rebond vers la gauche
                this.velocity = Math.sqrt(vx * vx + vy * vy);
                this.angle = Math.atan2(vy, vx);
                this.startX = this.x;
                this.startY = this.y;
                this.t = 0;
            }
        }

        // Sortie de l'écran (Haut)
        if (this.y < 25) { // Ceiling
            if (!this.isInvincible && this.damage < 50) {
                // REBOND PLAFOND
                this.y = 25;
                let vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t; // Vertical speed
                let vx = Math.cos(this.angle) * this.velocity;

                // Invert Y speed
                vy = Math.abs(vy) * 0.8; // Force bounce down

                this.velocity = Math.sqrt(vx * vx + vy * vy);
                this.angle = Math.atan2(vy, vx);
                this.t = 0;
                this.startX = this.x;
                this.startY = this.y;
            } else {
                // Dead
                return { dead: true, bounced: false, slammed: slammed };
            }
        }

        // Sortie latérale : seulement si dégâts >= seuil
        if (this.damage >= 50) {
            if (this.x < -100 || this.x > WIDTH + 100) {
                return { dead: true, bounced: false, slammed: slammed };
            }
        } else {
            // Sinon, on reste bloqué aux murs
            if (this.x < -100) this.x = 25;
            if (this.x > WIDTH + 100) this.x = WIDTH - 25;
        }

        return { dead: false, bounced: collided, slammed: slammed };
    }

    applyInput(key) {
        // WAKE UP from Respawn on any movement input
        if (this.isRespawning) {
            if (['LEFT', 'RIGHT', 'UP', 'DOWN', 'SLAM', 'DASH', 'HIT', 'GRENADE', 'THREAD'].includes(key)) {
                this.isRespawning = false;
                this.isInvincible = false;
                this.respawnTimer = 0;
            } else {
                // Pendant le respawn, on ne peut pas bouger
                return;
            }
        }

        // WAKE UP from Victory Stance on any input (except pure modifiers if any)
        // Only if grace period is over
        if (this.victoryStance && this.victoryStanceTimer <= 0) {
            if (['LEFT', 'RIGHT', 'UP', 'DOWN', 'SLAM', 'DASH', 'HIT', 'GRENADE', 'THREAD'].includes(key)) {
                this.victoryStance = false;
            }
        }

        // 1. GLOBAL STUN CHECK
        if (this.moveCooldown > 0) return;

        if (key === 'HIT') {
            if (this.attackCooldown > 0) return;
            this.isAttacking = true;
            this.isHit = true;
            this.activeHitboxTimer = 10;
            this.attackCooldown = 30;

            // Gestion des combos
            if (this.lastAction === 'HIT') {
                this.attackCombo++;
            } else {
                this.attackCombo = 1;
            }
            this.lastAction = 'HIT';

            // Combo dash + attaque
            if (this.dashAttackCombo) {
                this.dashAttackCombo = false;
                // Force d'éjection augmentée sera gérée dans GameRoom
            }

            // Déterminer la direction de l'attaque
            let attackDir = 'horizontal';
            if (this.lastMovement === 'up') {
                attackDir = 'up';
            } else if (this.lastMovement === 'horizontal' && (/* How to check DOWN attack? Uses lastMovement too? */ this.angle === -Math.PI / 2)) {
                // Wait, lastMovement is 'horizontal' even for DOWN? Let's check logic below
                // In applyInput: DOWN sets angle=-PI/2 but lastMovement='horizontal'. That's ambiguous.
                // I should fix applyInput DOWN to set lastMovement='down' or check angle directly.
                // Checking angle:
            }

            // Correction: let's rely on velocity/angle set by directions?
            // Actually, let's fix applyInput DOWN to set a distinct state for attack detection.

            // Better Logic:
            if (this.inputs?.UP) attackDir = 'up'; // If holding UP
            else if (this.inputs?.DOWN) attackDir = 'down'; // If holding DOWN
            else attackDir = 'side';

            // But inputs object is not fully reliable here if not using it exclusively.
            // Let's use lastMovement logic if previously set correctly.
            // Let's UPDATE the DOWN input block to set lastMovement = 'down'.

            if (this.lastMovement === 'up') attackDir = 'up';
            else if (this.lastMovement === 'down') attackDir = 'down';
            else attackDir = this.lastFacing === 1 ? 'right' : 'left';

            this.currentAttackDirection = attackDir;

            return { type: 'attack', direction: attackDir };
        }

        if (key === 'GRENADE') {
            if (this.grenadeCount > 0 && this.grenadeCooldown <= 0) {
                const vx = Math.cos(this.angle) * this.velocity;
                const vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;
                this.grenadeCount--;
                this.grenadeCooldown = 30; // 0.5s delay between throws
                return { type: 'grenade', x: this.x, y: this.y, vx: vx, vy: vy };
            }
            return;
        }

        if (key === 'SLAM') {
            this.t = 0;
            this.startX = this.x;
            this.startY = this.y;
            this.velocity = 110; // Tuned for T_INC 0.18
            this.angle = Math.PI / 2;
            this.moveCooldown = 20;
            return 'slam';
        }

        if (key === 'DASH') {
            if (this.dashCooldown <= 0) {
                this.t = 0;
                this.startX = this.x;
                this.startY = this.y;
                this.velocity = -130; // Tuned for T_INC 0.18
                if (this.lastFacing === 1) this.angle = Math.PI;
                else this.angle = 0;
                this.dashCooldown = 60;
                this.lastAction = 'DASH';
                this.dashAttackCombo = true; // Prochain hit sera un combo
                return 'dash';
            }
            return;
        }

        if (key === 'THREAD') {
            if (this.threadCooldown > 0) return;
            // Lancer le fil depuis la main opposée
            const threadSpeed = 15;
            const threadAngle = this.lastFacing === 1 ? 0 : Math.PI; // Direction opposée à la batte
            this.threadActive = {
                x: this.x + Math.cos(threadAngle) * 30,
                y: this.y + Math.sin(threadAngle) * 30,
                vx: Math.cos(threadAngle) * threadSpeed,
                vy: Math.sin(threadAngle) * threadSpeed,
                age: 0
            };
            this.threadCooldown = 120; // 2 secondes
            this.lastAction = 'THREAD';
            return 'thread';
        }

        if (key === 'WEB') {
            if (!this.webAvailable || this.webActive) return; // Une seule toile par vie
            // Créer la toile d'araignée à la position actuelle
            this.webActive = {
                x: this.x,
                y: this.y,
                radius: 50,
                age: 0
            };
            this.webAvailable = false; // Utilisée, ne peut plus être utilisée cette vie
            this.lastAction = 'WEB';
            return 'web';
        }

        this.t = 0;
        this.startX = this.x;
        this.startY = this.y;
        this.velocity = -75; // Tuned for T_INC 0.18

        if (key === 'LEFT') {
            this.angle = Math.PI / 3;
            this.lastFacing = -1;
            this.lastMovement = 'horizontal';
        }
        else if (key === 'RIGHT') {
            this.angle = 2 * Math.PI / 3;
            this.lastFacing = 1;
            this.lastMovement = 'horizontal';
        }
        else if (key === 'UP') {
            this.angle = Math.PI / 2;
            this.lastMovement = 'up';
        }
        else if (key === 'DOWN') {
            this.angle = -Math.PI / 2;
            this.velocity = -70; // Tuned for T_INC 0.18
            this.lastMovement = 'down'; // Was 'horizontal' - Now distinct for Down Attacks
        }
    }

    prepareEjection(angleFromAttacker, comboMultiplier = 1.0) {
        this.isHit = false;
        this.isAttacking = false;
        this.activeHitboxTimer = 0;

        this.damage += 10;
        const force = (25 + (this.damage * 1.2)) * comboMultiplier;

        let vy = Math.sin(angleFromAttacker);
        let vx = Math.cos(angleFromAttacker);

        if (vy > -0.2) {
            const dir = vx >= 0 ? 1 : -1;
            vx = dir * 0.7;
            vy = -0.7;
            angleFromAttacker = Math.atan2(vy, vx);
        }

        this.pendingLaunch = {
            velocity: force,
            angle: angleFromAttacker
        };

        this.moveCooldown = 90;
    }

    enterVictoryStance() {
        this.victoryStance = true;
        this.victoryStanceTimer = 30; // 0.5s grace period
        this.velocity = 0;
        this.t = 0;
    }

    applyPendingLaunch() {
        if (this.pendingLaunch) {
            this.t = 0;
            this.startX = this.x;
            this.startY = this.y;
            this.velocity = this.pendingLaunch.velocity;
            this.angle = this.pendingLaunch.angle;
            this.pendingLaunch = null;
            return true;
        }
        return false;
    }
}

module.exports = Player;
