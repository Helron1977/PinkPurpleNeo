/**
 * RagdollRenderer
 * 
 * Rendu du personnage sphérique avec déformations ragdoll
 * Style cohérent avec le rendering actuel (neon glow)
 */

import { GAME_CONFIG } from '../constants.js';

export class RagdollRenderer {
    constructor(ctx) {
        this.ctx = ctx;
    }

    /**
     * Dessine le personnage en mode ragdoll
     */
    drawRagdoll(ragdollState, style) {
        if (!ragdollState) return;

        const ctx = this.ctx;

        // 1. Dessiner main gauche (derrière)
        this.drawHand(ragdollState.leftHand, style);

        // 2. Dessiner corps avec déformation
        this.drawCore(ragdollState.core, style);

        // 3. Dessiner main droite + batte (devant)
        this.drawHandWithBat(ragdollState.rightHand, ragdollState.batAngle, style);
    }

    /**
     * Dessine le corps sphérique avec déformation
     */
    drawCore(core, style) {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(core.x, core.y);
        ctx.rotate(core.rotation || 0);

        // Appliquer déformation (squash & stretch)
        const deformAngle = core.deformAngle || 0;
        ctx.rotate(deformAngle);
        ctx.scale(core.deformX || 1.0, core.deformY || 1.0);
        ctx.rotate(-deformAngle);

        const r = GAME_CONFIG.PLAYER_RADIUS;

        // Style neon (identique au rendering actuel)
        ctx.shadowBlur = 0;
        ctx.fillStyle = style.color;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = style.glowColor;
        ctx.shadowBlur = 20;
        ctx.stroke();

        // Overlay color
        ctx.shadowBlur = 0;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Dessine une main
     */
    drawHand(hand, style) {
        const ctx = this.ctx;

        ctx.save();
        ctx.fillStyle = style.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = style.glowColor;
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Dessine main droite avec batte
     */
    drawHandWithBat(hand, batAngle, style) {
        const ctx = this.ctx;

        // Dessiner batte
        ctx.save();
        ctx.translate(hand.x, hand.y);
        ctx.rotate(batAngle || 0);

        // Style batte (identique à l'actuel)
        ctx.fillStyle = '#eee';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;

        // Handle
        ctx.fillRect(-2, -5, 15, 6);

        // Bat body
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(80, -10);
        ctx.quadraticCurveTo(90, -5, 90, 0);
        ctx.quadraticCurveTo(90, 5, 80, 10);
        ctx.lineTo(10, 5);
        ctx.fill();

        ctx.restore();

        // Dessiner main par-dessus
        this.drawHand(hand, style);
    }
}
