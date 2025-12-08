import { GAME_CONFIG, COLORS } from '../constants.js';

export class WorldRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        this.obstaclesCanvas = document.createElement('canvas');
        this.obstaclesCtx = this.obstaclesCanvas.getContext('2d');
        this.metalBars = [];
        this.resize();
    }

    resize() {
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

            // Glass effect
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.strokeStyle = bar.color;
            ctx.lineWidth = 2;

            // Neon Glow
            ctx.shadowBlur = 20;
            ctx.shadowColor = bar.color;

            ctx.fillRect(0, 0, bar.w, bar.h);
            ctx.strokeRect(0, 0, bar.w, bar.h);

            // Subtle reflection
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(0, bar.h);
            ctx.lineTo(bar.w, 0);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }
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
        this.ctx.save();
        this.ctx.drawImage(this.obstaclesCanvas, 0, 0);
        this.ctx.restore();
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

    drawWalls() {
        const ctx = this.ctx;
        const { WIDTH, HEIGHT } = GAME_CONFIG;
        const WALL_THICKNESS = 5;

        // Mur gauche
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff0000';
        ctx.fillRect(0, 0, WALL_THICKNESS, HEIGHT);
        
        // Mur droit
        ctx.fillRect(WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, HEIGHT);
        ctx.shadowBlur = 0;
    }
}

