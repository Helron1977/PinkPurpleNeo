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
            this.startY = 1200;
            this.velocity = 0;
            this.angle = Math.PI / 2;
        }
        this.t = 0;
        this.isHit = false;
        this.lastFacing = 1;
    }

    update(obstacles) {
        // VICTORY STANCE: Attacker floats until input
        if (this.victoryStance) {
            this.velocity = 0;
            this.t = 0;
            return { dead: false, bounced: false };
        }

        // Update cooldowns
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.moveCooldown > 0) this.moveCooldown--;
        if (this.attackCooldown > 0) this.attackCooldown--;

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

        // Ground collision
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
            } else {
                let vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;
                let vx = Math.cos(this.angle) * this.velocity;

                vy = -Math.abs(vy) * 0.6;
                vx = vx * 0.8;

                if (Math.abs(vy) < 8 && Math.abs(vx) < 2) {
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

        if (this.x < -100 || this.x > WIDTH + 100 || this.y < -100) {
            return { dead: true, bounced: false };
        }

        return { dead: false, bounced: collided };
    }

    applyInput(key) {
        // WAKE UP from Victory Stance on any input (except pure modifiers if any)
        // If movement key is pressed, we clear stance and process input
        if (this.victoryStance) {
            if (['LEFT', 'RIGHT', 'UP', 'DOWN', 'SLAM', 'DASH', 'HIT', 'GRENADE'].includes(key)) {
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
            return 'attack';
        }

        if (key === 'GRENADE') {
            if (this.grenadeCount > 0) {
                const vx = Math.cos(this.angle) * this.velocity;
                const vy = Math.sin(this.angle) * this.velocity + GRAVITY * this.t;
                this.grenadeCount--;
                return { type: 'grenade', x: this.x, y: this.y, vx: vx, vy: vy };
            }
            return;
        }

        if (key === 'SLAM') {
            this.t = 0;
            this.startX = this.x;
            this.startY = this.y;
            this.velocity = 80;
            this.angle = Math.PI / 2;
            this.moveCooldown = 20;
            return 'slam';
        }

        if (key === 'DASH') {
            if (this.dashCooldown <= 0) {
                this.t = 0;
                this.startX = this.x;
                this.startY = this.y;
                this.velocity = -120;
                if (this.lastFacing === 1) this.angle = Math.PI;
                else this.angle = 0;
                this.dashCooldown = 60;
                return 'dash';
            }
            return;
        }

        this.t = 0;
        this.startX = this.x;
        this.startY = this.y;
        this.velocity = -50;

        if (key === 'LEFT') {
            this.angle = Math.PI / 3;
            this.lastFacing = -1;
        }
        else if (key === 'RIGHT') {
            this.angle = 2 * Math.PI / 3;
            this.lastFacing = 1;
        }
        else if (key === 'UP') this.angle = Math.PI / 2;
        else if (key === 'DOWN') {
            this.angle = -Math.PI / 2;
            this.velocity = -50;
        }
    }

    prepareEjection(angleFromAttacker) {
        this.isHit = false;
        this.isAttacking = false;
        this.activeHitboxTimer = 0;

        this.damage += 10;
        const force = 25 + (this.damage * 1.2);

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
