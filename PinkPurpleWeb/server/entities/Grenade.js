const { WIDTH, HEIGHT, GRAVITY, T_INC } = require('../constants');

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

module.exports = Grenade;
