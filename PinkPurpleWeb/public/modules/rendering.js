/**
 * Rendering Module
 * Handles all canvas drawing operations
 */

import { GAME_CONFIG, COLORS } from './constants.js';

export class Renderer {
    constructor(canvas, networkManager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.network = networkManager;
        this.scale = 1;
        this.particles = [];
        this.shakeIntensity = 0;
        this.trails = {};
        this.metalBars = [];
        this.animationId = null;
        this.floatingMessages = []; // For damage/action text

        // Optimization: Off-screen canvas for obstacles
        this.obstaclesCanvas = document.createElement('canvas');
        this.obstaclesCtx = this.obstaclesCanvas.getContext('2d');

        this.setupCanvas();
    }

    setupCanvas() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.scale = Math.min(
            this.canvas.width / GAME_CONFIG.WIDTH,
            this.canvas.height / GAME_CONFIG.HEIGHT
        );

        // Resize cache canvas
        this.obstaclesCanvas.width = GAME_CONFIG.WIDTH;
        this.obstaclesCanvas.height = GAME_CONFIG.HEIGHT;
        this.preRenderObstacles();
    }

    setObstacles(obstacles) {
        this.metalBars = obstacles.map(o => ({
            ...o,
            angle: 0,
            color: `rgba(${100 + Math.random() * 50}, ${100 + Math.random() * 50}, ${110 + Math.random() * 50}, 0.8)`
        }));
        this.preRenderObstacles();
    }

    preRenderObstacles() {
        const ctx = this.obstaclesCtx;
        ctx.clearRect(0, 0, this.obstaclesCanvas.width, this.obstaclesCanvas.height);

        for (const bar of this.metalBars) {
            ctx.save();
            ctx.translate(bar.x, bar.y);
            ctx.rotate(bar.angle);
            ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
            ctx.strokeStyle = bar.color;
            ctx.lineWidth = 4;
            ctx.shadowBlur = 15;
            ctx.shadowColor = bar.color;
            ctx.fillRect(0, 0, bar.w, bar.h);
            ctx.strokeRect(0, 0, bar.w, bar.h);
            ctx.beginPath();
            ctx.moveTo(10, 10);
            ctx.lineTo(bar.w - 10, bar.h - 10);
            ctx.moveTo(bar.w - 10, 10);
            ctx.lineTo(10, bar.h - 10);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    }

    createExplosion(x, y, color) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: color
            });
        }
        this.shakeIntensity = 20;
    }

    addShake(intensity) {
        this.shakeIntensity = intensity;
    }

    // Main draw loop
    draw() {
        const { players, scores, grenades, explosions } = this.network.getState();

        // Shake decay
        if (this.shakeIntensity > 0) {
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
        }

        const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
        const shakeY = (Math.random() - 0.5) * this.shakeIntensity;

        // Clear screen
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply transform with shake
        this.ctx.setTransform(
            this.scale, 0, 0, this.scale,
            (this.canvas.width - GAME_CONFIG.WIDTH * this.scale) / 2 + shakeX,
            (this.canvas.height - GAME_CONFIG.HEIGHT * this.scale) / 2 + shakeY
        );

        this.drawBackground();
        this.drawObstacles();
        this.drawFloor();
        this.drawPlayers(players);
        this.drawGrenades(grenades);
        this.drawExplosions(explosions);
        this.drawParticles();
        this.drawScoreCircles(players, scores);
        this.drawFloatingMessages(); // Draw damage/action text

        this.animationId = requestAnimationFrame(() => this.draw());
    }

    drawBackground() {
        const ctx = this.ctx;
        const { WIDTH, HEIGHT } = GAME_CONFIG;

        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLORS.GRID;
        const horizonY = HEIGHT / 2;
        const centerX = WIDTH / 2;

        // Perspective grid
        for (let i = -10; i <= 10; i++) {
            ctx.beginPath();
            ctx.moveTo(centerX + i * 50, horizonY + 50);
            ctx.lineTo(centerX + i * 400, HEIGHT);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX + i * 50, horizonY - 50);
            ctx.lineTo(centerX + i * 400, 0);
            ctx.stroke();
        }

        // Horizontal lines with animation
        const timeOffset = (Date.now() / 50) % 100;
        for (let y = horizonY + 50; y < HEIGHT; y += 80) {
            ctx.beginPath();
            ctx.moveTo(0, y + timeOffset);
            ctx.lineTo(WIDTH, y + timeOffset);
            ctx.stroke();
        }
        for (let y = horizonY - 50; y > 0; y -= 80) {
            ctx.beginPath();
            ctx.moveTo(0, y - timeOffset);
            ctx.lineTo(WIDTH, y - timeOffset);
            ctx.stroke();
        }

        // Glow zones
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'cyan';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.fillRect(0, HEIGHT - 100, WIDTH, 100);
        ctx.fillRect(0, 0, WIDTH, 100);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    drawObstacles() {
        const ctx = this.ctx;
        ctx.save();
        // Draw the pre-rendered obstacles image
        // The main context already handles the global scale transform
        ctx.drawImage(this.obstaclesCanvas, 0, 0);
        ctx.restore();
    }

    drawFloor() {
        const ctx = this.ctx;
        const { WIDTH, HEIGHT } = GAME_CONFIG;

        ctx.strokeStyle = COLORS.CYAN;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.CYAN;
        ctx.beginPath();
        ctx.moveTo(0, HEIGHT - 40);
        ctx.lineTo(WIDTH, HEIGHT - 40);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    drawPlayers(players) {
        const ctx = this.ctx;

        for (const id in players) {
            const p = players[id];

            // Update trail
            if (!this.trails[id]) this.trails[id] = [];
            this.trails[id].push({ x: p.x, y: p.y });
            if (this.trails[id].length > GAME_CONFIG.TRAIL_LENGTH) {
                this.trails[id].shift();
            }

            // Draw trail
            ctx.save();
            ctx.beginPath();
            if (this.trails[id].length > 0) {
                ctx.moveTo(this.trails[id][0].x, this.trails[id][0].y);
                for (let i = 1; i < this.trails[id].length; i++) {
                    ctx.lineTo(this.trails[id][i].x, this.trails[id][i].y);
                }
            }
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.4;
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.stroke();
            ctx.restore();

            // Draw player
            ctx.shadowBlur = 20;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.fillStyle = p.color;
            const r = GAME_CONFIG.PLAYER_RADIUS + Math.sin(Date.now() / 100) * 2;
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();

            if (p.isHit) {
                ctx.strokeStyle = COLORS.WHITE;
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }
    }

    drawGrenades(grenades) {
        const ctx = this.ctx;

        for (const g of grenades) {
            ctx.save();
            ctx.shadowBlur = 15;
            ctx.shadowColor = COLORS.YELLOW;
            ctx.fillStyle = COLORS.YELLOW;
            ctx.beginPath();
            ctx.arc(g.x, g.y, GAME_CONFIG.GRENADE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }

    drawExplosions(explosions) {
        const ctx = this.ctx;

        for (let i = explosions.length - 1; i >= 0; i--) {
            const exp = explosions[i];
            exp.age += 0.05;

            ctx.save();
            ctx.globalAlpha = 1 - exp.age;
            ctx.shadowBlur = 30;
            ctx.shadowColor = COLORS.YELLOW;
            ctx.strokeStyle = COLORS.YELLOW;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(exp.x, exp.y, exp.radius * exp.age, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            if (exp.age >= 1) {
                explosions.splice(i, 1);
            }
        }
    }

    drawParticles() {
        const ctx = this.ctx;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 5, 5);
            ctx.globalAlpha = 1;
        }
    }

    drawScoreCircles(players, scores) {
        if (!scores) return;

        const ctx = this.ctx;
        const { WIDTH } = GAME_CONFIG;

        ctx.save();
        ctx.font = "bold 80px Orbitron";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Get player stats
        let p1Damage = 0, p2Damage = 0;
        let p1Grenades = 0, p2Grenades = 0;

        if (players.p1) {
            p1Damage = players.p1.damage || 0;
            p1Grenades = players.p1.grenadeCount || 0;
        }
        if (players.p2) {
            p2Damage = players.p2.damage || 0;
            p2Grenades = players.p2.grenadeCount || 0;
        }

        // Draw circles
        this.drawDamageCircle(250, 250, GAME_CONFIG.PLAYER1_COLOR, scores.p1 || 0, p1Damage, p1Grenades);
        this.drawDamageCircle(WIDTH - 250, 250, GAME_CONFIG.PLAYER2_COLOR, scores.p2 || 0, p2Damage, p2Grenades);

        ctx.restore();
    }

    drawDamageCircle(x, y, color, score, damage, grenadeCount) {
        const ctx = this.ctx;
        const radius = GAME_CONFIG.SCORE_CIRCLE_RADIUS;

        // Background circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.BLACK_TRANSPARENT;
        ctx.fill();

        // Damage fill
        const damagePercent = Math.min(damage, 100) / 100;
        if (damagePercent > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * damagePercent));
            ctx.lineTo(x, y);
            ctx.fillStyle = COLORS.RED;
            ctx.fill();
        }

        // Border ring
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.shadowBlur = 30;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Score text
        ctx.fillStyle = color;
        ctx.fillText(score, x, y);

        // Grenade indicators
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x - 30 + i * 30, y + 100, 10, 0, Math.PI * 2);
            if (i < grenadeCount) {
                ctx.fillStyle = 'red';
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'red';
            } else {
                ctx.fillStyle = '#333';
                ctx.shadowBlur = 0;
            }
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    // === FLOATING MESSAGES SYSTEM ===
    addFloatingDamage(x, y, damage, color) {
        this.floatingMessages.push({
            x, y,
            text: `+${damage}`,
            color,
            life: 1.0,
            vy: -2,
            vx: (Math.random() - 0.5) * 1
        });
    }

    addFloatingText(x, y, text, color = '#fff') {
        this.floatingMessages.push({
            x, y,
            text,
            color,
            life: 1.0,
            vy: -1.5,
            vx: 0
        });
    }

    drawFloatingMessages() {
        const ctx = this.ctx;

        for (let i = this.floatingMessages.length - 1; i >= 0; i--) {
            const msg = this.floatingMessages[i];
            msg.y += msg.vy;
            msg.x += msg.vx;
            msg.life -= 0.02;

            if (msg.life <= 0) {
                this.floatingMessages.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.globalAlpha = msg.life;
            ctx.font = 'bold 40px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillStyle = msg.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(msg.text, msg.x, msg.y);
            ctx.fillText(msg.text, msg.x, msg.y);
            ctx.restore();
        }
    }

    start() {
        this.draw();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
}
