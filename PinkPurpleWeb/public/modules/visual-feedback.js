/**
 * Visual Feedback Module
 * Handles floating messages, cooldown indicators, and visual effects
 */

import { GAME_CONFIG, COLORS } from './constants.js';

export class VisualFeedback {
    constructor(ctx) {
        this.ctx = ctx;
        this.floatingMessages = [];
        this.cooldowns = {
            dash: { current: 0, max: 60 },
            grenades: { current: 3, max: 3 }
        };
    }

    // Add floating damage text
    addDamageText(x, y, damage, color) {
        this.floatingMessages.push({
            x,
            y,
            text: `+${damage}`,
            color,
            life: 1.0,
            vy: -2, // Float upward
            vx: (Math.random() - 0.5) * 1
        });
    }

    // Add floating action text
    addActionText(x, y, text, color = '#fff') {
        this.floatingMessages.push({
            x,
            y,
            text,
            color,
            life: 1.0,
            vy: -1.5,
            vx: 0
        });
    }

    // Update and draw floating messages
    updateFloatingMessages() {
        const ctx = this.ctx;

        for (let i = this.floatingMessages.length - 1; i >= 0; i--) {
            const msg = this.floatingMessages[i];

            // Update position
            msg.y += msg.vy;
            msg.x += msg.vx;
            msg.life -= 0.02;

            // Remove if dead
            if (msg.life <= 0) {
                this.floatingMessages.splice(i, 1);
                continue;
            }

            // Draw
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

    // Update cooldown values
    updateCooldowns(dashCooldown, grenadeCount) {
        this.cooldowns.dash.current = dashCooldown;
        this.cooldowns.grenades.current = grenadeCount;
    }

    // Draw cooldown indicator (circular progress)
    drawCooldownCircle(x, y, percent, color, label) {
        const ctx = this.ctx;
        const radius = 25;

        ctx.save();

        // Background circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fill();

        // Progress arc
        if (percent < 1) {
            ctx.beginPath();
            ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * percent));
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.stroke();

            // Dimmed overlay
            ctx.beginPath();
            ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fill();
        } else {
            // Ready - glow effect
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);

        ctx.restore();
    }

    // Draw all cooldown indicators for a player
    drawPlayerCooldowns(x, y, dashCooldown, grenadeCount, color) {
        const dashPercent = 1 - (dashCooldown / this.cooldowns.dash.max);

        // Dash cooldown
        this.drawCooldownCircle(x - 35, y, dashPercent, '#00ffaa', '⚡');

        // Grenade count
        for (let i = 0; i < 3; i++) {
            const gx = x + 35 + (i * 30);
            const available = i < grenadeCount;
            this.drawCooldownCircle(
                gx, y,
                available ? 1 : 0,
                available ? '#ffaa00' : '#333',
                '💣'
            );
        }
    }

    // Enhanced particle effects
    createDashParticles(x, y, color, particles) {
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                life: 0.8,
                color,
                size: 3 + Math.random() * 3
            });
        }
    }

    // Draw enhanced particles
    drawEnhancedParticles(particles) {
        const ctx = this.ctx;

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            p.size *= 0.98;

            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 5;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Draw combo/kill streak indicator
    drawKillStreak(streak, x, y) {
        if (streak < 2) return;

        const ctx = this.ctx;
        ctx.save();

        const text = streak === 2 ? 'DOUBLE!' :
            streak === 3 ? 'TRIPLE!' :
                'MEGA!';

        ctx.font = 'bold 60px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff0';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0';

        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);

        ctx.restore();
    }

    // Screen flash effect (different colors for different events)
    createScreenFlash(type = 'hit') {
        const colors = {
            hit: 'rgba(255, 255, 255, 0.3)',
            death: 'rgba(255, 0, 0, 0.4)',
            win: 'rgba(0, 255, 0, 0.3)'
        };

        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.backgroundColor = colors[type] || colors.hit;
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '9999';
        flash.style.animation = 'flash-fade 0.2s';

        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 200);
    }
}

// Add CSS animation for flash
const style = document.createElement('style');
style.textContent = `
    @keyframes flash-fade {
        0% { opacity: 1; }
        100% { opacity: 0; }
    }
`;
document.head.appendChild(style);
