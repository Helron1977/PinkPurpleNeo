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
        this.lastFacing = 1; // 1 for Right, -1 for Left
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
            this.moveCooldown = 30; // Cannot move for 0.5 second (reduced from 1s)
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

                // Dash always goes horizontally in the direction user is facing
                if (this.lastFacing === 1) {
                    this.angle = 0; // Right
                } else {
                    this.angle = Math.PI; // Left
                }

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

        if (key === 'LEFT') {
            this.angle = Math.PI / 3; // 60° up-left
            this.lastFacing = -1;
        }
        else if (key === 'RIGHT') {
            this.angle = 2 * Math.PI / 3; // 120° up-right
            this.lastFacing = 1;
        }
        else if (key === 'UP') this.angle = Math.PI / 2; // 90° straight up
        else if (key === 'DOWN') {
            // Fast fall / Descent control
            this.angle = -Math.PI / 2; // 270° straight down
            this.velocity = -50; // Downward velocity (sin(-90)=-1, vy=50)
            // Note: Gravity will also accelerate this
        }
    }

    getEjected(angleFromAttacker) {
        this.damage += 10;
        const force = 60 + (this.damage * 2);
        this.t = 0;
        this.startX = this.x;
        this.startY = this.y;
        this.velocity = -force;
        this.angle = angleFromAttacker;
        this.moveCooldown = 30; // Stun for 0.5s
    }
}

module.exports = Player;
