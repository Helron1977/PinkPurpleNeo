import { GAME_CONFIG, COLORS } from '../constants.js';
import { Projection3D } from '../animations/Projection3D.js';

export class EffectRenderer {
    constructor(ctx, comboSystem) {
        this.ctx = ctx;
        this.comboSystem = comboSystem;
        this.particles = [];
        this.floatingMessages = [];
        this.shakeIntensity = 0;
        this.projection3D = new Projection3D(); // Instance pour projeter les effets correctement
    }

    addShake(intensity) {
        this.shakeIntensity = intensity;
    }

    updateShake() {
        if (this.shakeIntensity > 0) {
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
        }
        return {
            x: (Math.random() - 0.5) * this.shakeIntensity,
            y: (Math.random() - 0.5) * this.shakeIntensity
        };
    }

    addParticle(x, y, color, type = 'spark') {
        this.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: type === 'spark' ? 0.5 : 1.0,
            color,
            type
        });
    }

    createExplosion(x, y, color) {
        for (let i = 0; i < 20; i++) {
            this.addParticle(x, y, color);
        }
        this.shakeIntensity = 20;
    }

    createHitParticles(x, y) {
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 40,
                vy: (Math.random() - 0.5) * 40,
                life: 2.0,
                color: i % 2 === 0 ? '#ff0044' : '#fff', // White hot
                type: 'blood'
            });
        }
    }

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

            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 5, 5);
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

    drawCombos(players) {
        const ctx = this.ctx;
        for (const [id, p] of Object.entries(players)) {
            const combo = this.comboSystem.getCombo(id);
            if (combo && combo.level >= 2) {
                const time = Date.now() / 200;
                const pulse = 1 + Math.sin(time) * 0.2;
                
                ctx.save();
                ctx.translate(p.x, p.y - 50);
                
                ctx.shadowBlur = 20 * pulse;
                ctx.shadowColor = combo.color;
                ctx.fillStyle = combo.color;
                ctx.font = `bold ${20 + combo.level * 5}px Orbitron`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Outline Black
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#000';
                ctx.strokeText(`${combo.count}x ${combo.name}`, 0, 0);
                ctx.fillText(`${combo.count}x ${combo.name}`, 0, 0);
                
                // Particles
                for (let i = 0; i < combo.level * 2; i++) {
                    const angle = (time * 2 + (i / combo.level) * Math.PI * 2) % (Math.PI * 2);
                    const dist = 30 + Math.sin(time * 3 + i) * 10;
                    ctx.fillStyle = combo.color;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.arc(
                        Math.cos(angle) * dist,
                        Math.sin(angle) * dist,
                        3, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
                ctx.restore();
            }
        }
    }

    drawVictoryAnimation(x, y, playerColor, startTime) {
        const ctx = this.ctx;
        const time = Date.now() / 1000;
        
        ctx.save();
        ctx.translate(x + 5, y + 5); // Centered offset
        
        // Energy Circle (Cartoon Style)
        const pulseRadius = 100 + Math.sin(time * 3) * 20;
        
        // Fond cercle
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2); ctx.fill();

        // Contour
        ctx.strokeStyle = playerColor;
        ctx.lineWidth = 6;
        ctx.shadowBlur = 30;
        ctx.shadowColor = playerColor;
        ctx.globalAlpha = 1.0;
        ctx.stroke();
        
        // Contour Noir fin pour netteté
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.stroke();
        
        // Particles
        for (let i = 0; i < 12; i++) {
            const angle = (time * 2 + (i / 12) * Math.PI * 2);
            const dist = 80 + Math.sin(time * 4) * 10;
            const px = Math.cos(angle) * dist;
            const py = Math.sin(angle) * dist;
            
            ctx.fillStyle = playerColor;
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke(); // Outline particle
        }
        
        // Text
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6; // Gros contour noir
        ctx.font = 'bold 60px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffd700';
        
        ctx.strokeText('VICTORY!', 0, -150);
        ctx.fillText('VICTORY!', 0, -150);
        
        ctx.restore();
        
        return (Date.now() - startTime < 3000);
    }
}

