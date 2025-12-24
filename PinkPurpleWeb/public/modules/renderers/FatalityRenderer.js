import { GAME_CONFIG } from '../constants.js';

export class FatalityRenderer {
    constructor(canvas, effectRenderer, soundManager) {
        this.canvas = canvas;
        this.effectRenderer = effectRenderer;
        this.soundManager = soundManager;

        this.active = false;
        this.startTime = 0;
        this.type = null;
    }

    start(type, winner, victim) {
        this.active = true;
        this.startTime = Date.now();
        this.type = type;
        this.soundManager.playTone(50, 'sine', 3.0, 0.5);
    }

    stop() {
        this.active = false;
    }

    draw(ctx, camera) {
        if (!this.active) return;

        const time = (Date.now() - this.startTime) / 1000;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const cx = width / 2;
        const cy = height / 2;

        if (time > 4.0) {
            this.stop();
            return;
        }

        // Screen Space
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Dim Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Letterbox
        const barH = 100;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, barH);
        ctx.fillRect(0, height - barH, width, barH);

        // Center Scene
        ctx.translate(cx, cy);
        const scale = 1.5;
        ctx.scale(scale, scale);

        if (this.type === 'cannon') this.renderCannon(ctx, time);
        else if (this.type === 'racket') this.renderRacket(ctx, time);
        else this.renderGeneric(ctx, time);

        // Text
        if (time > 2.5) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#f0f';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.font = "italic 900 60px 'Orbitron', sans-serif";
            ctx.fillText("FATALITY", 0, 0);
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    renderCannon(ctx, t) {
        // Simple shape based animation
        if (t < 2.0) {
            // Draw Cannon
            ctx.fillStyle = '#333';
            ctx.fillRect(-40, -20, 80, 40);
            // Barrel extension
            ctx.fillStyle = '#555';
            ctx.fillRect(40, -15, 60, 30);

            // Aiming
            ctx.rotate(Math.sin(t * 2) * 0.05);
        } else if (t < 2.2) {
            // Fire Flash
            ctx.fillStyle = '#fff';
            ctx.fillRect(-1000, -1000, 2000, 2000);
            this.effectRenderer.addShake(20);
        }
    }

    renderRacket(ctx, t) {
        // Swing
        const swing = Math.sin(t * 5);
        ctx.rotate(swing);
        ctx.fillStyle = '#0ff';
        ctx.fillRect(-5, -50, 10, 50); // Handle
        ctx.beginPath(); ctx.arc(0, -70, 20, 0, Math.PI * 2); ctx.stroke();
    }

    renderGeneric(ctx, t) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fill();
    }
}
