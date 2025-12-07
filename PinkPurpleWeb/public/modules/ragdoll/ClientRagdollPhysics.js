/**
 * ClientRagdollPhysics
 * 
 * Moteur physique ragdoll côté client
 * Identique au serveur pour cohérence, mais calculé localement
 */

export class ClientRagdollPhysics {
    constructor() {
        this.gravity = 8;
        this.ragdolls = new Map();
    }

    createRagdoll(playerId, x, y, facingRight) {
        const ragdoll = {
            enabled: false,
            recoveryTimer: 0,

            core: {
                x: x,
                y: y,
                vx: 0,
                vy: 0,
                radius: 25,
                rotation: 0,
                angularVelocity: 0,
                deformX: 1.0,
                deformY: 1.0,
                deformAngle: 0,
                deformVelX: 0,
                deformVelY: 0
            },

            leftHand: {
                x: x - 20,
                y: y + 10,
                vx: 0,
                vy: 0,
                targetOffsetX: -20,
                targetOffsetY: 10
            },

            rightHand: {
                x: x + 20,
                y: y + 10,
                vx: 0,
                vy: 0,
                targetOffsetX: 20,
                targetOffsetY: 10
            },

            batAngle: facingRight ? -Math.PI / 4 : Math.PI + Math.PI / 4,
            batAngularVelocity: 0,
            facing: facingRight ? 1 : -1
        };

        this.ragdolls.set(playerId, ragdoll);
        return ragdoll;
    }

    activateRagdoll(playerId, impactAngle, force, currentX, currentY, angularVelocity = null, contactX = null, contactY = null) {
        const ragdoll = this.ragdolls.get(playerId);
        if (!ragdoll) return;

        // Réinitialiser position
        ragdoll.core.x = currentX;
        ragdoll.core.y = currentY;

        // Activer
        ragdoll.enabled = true;
        ragdoll.recoveryTimer = 2000; // 2 secondes

        // Vélocités
        const vx = Math.cos(impactAngle) * force;
        const vy = Math.sin(impactAngle) * force;

        ragdoll.core.vx = vx;
        ragdoll.core.vy = vy;
        
        // Utiliser angularVelocity fourni si disponible, sinon calculer par défaut
        ragdoll.core.angularVelocity = angularVelocity !== null ? angularVelocity : vx * 0.02;

        // Déformation initiale
        ragdoll.core.deformAngle = impactAngle;
        ragdoll.core.deformX = 0.7;
        ragdoll.core.deformY = 1.3;

        // Mains - Position initiale relative au corps
        const handFactor = 0.6;
        ragdoll.leftHand.x = currentX + ragdoll.leftHand.targetOffsetX;
        ragdoll.leftHand.y = currentY + ragdoll.leftHand.targetOffsetY;
        ragdoll.leftHand.vx = vx * handFactor - 3;
        ragdoll.leftHand.vy = vy * handFactor - 5;

        ragdoll.rightHand.x = currentX + ragdoll.rightHand.targetOffsetX;
        ragdoll.rightHand.y = currentY + ragdoll.rightHand.targetOffsetY;
        ragdoll.rightHand.vx = vx * handFactor + 3;
        ragdoll.rightHand.vy = vy * handFactor - 5;

        // Batte
        ragdoll.batAngularVelocity = (Math.random() - 0.5) * 0.4;
    }

    update(deltaTime) {
        for (const [playerId, ragdoll] of this.ragdolls) {
            if (!ragdoll.enabled) continue;

            this.updateRagdoll(ragdoll, deltaTime);

            ragdoll.recoveryTimer -= deltaTime * 1000;
            if (ragdoll.recoveryTimer <= 0) {
                ragdoll.enabled = false;
            }
        }
    }

    updateRagdoll(ragdoll, deltaTime) {
        const core = ragdoll.core;

        // Gravité
        core.vy += this.gravity;

        // Air resistance
        core.vx *= 0.98;
        core.vy *= 0.98;

        // Position
        core.x += core.vx;
        core.y += core.vy;

        // Rotation
        core.rotation += core.angularVelocity;
        core.angularVelocity *= 0.95;

        // Déformation spring
        const deformSpring = 0.15;
        const deformDamping = 0.9;

        core.deformVelX += (1.0 - core.deformX) * deformSpring;
        core.deformVelY += (1.0 - core.deformY) * deformSpring;
        core.deformVelX *= deformDamping;
        core.deformVelY *= deformDamping;

        core.deformX += core.deformVelX;
        core.deformY += core.deformVelY;

        // Clamp
        core.deformX = Math.max(0.5, Math.min(1.5, core.deformX));
        core.deformY = Math.max(0.5, Math.min(1.5, core.deformY));

        // Collision sol
        const GROUND_Y = 1080 - 40;
        if (core.y + core.radius > GROUND_Y) {
            core.y = GROUND_Y - core.radius;
            core.vy *= -0.5;

            // Squash
            core.deformY = 0.6;
            core.deformX = 1.4;
            core.deformAngle = Math.PI / 2;

            core.vx *= 0.85;
            core.angularVelocity *= 0.8;
        }

        // Mains
        this.updateHand(ragdoll.leftHand, core);
        this.updateHand(ragdoll.rightHand, core);

        // Batte
        ragdoll.batAngle += ragdoll.batAngularVelocity;
        ragdoll.batAngularVelocity *= 0.98;
    }

    updateHand(hand, core) {
        hand.vy += this.gravity;
        hand.vx *= 0.95;
        hand.vy *= 0.95;

        const targetX = core.x + hand.targetOffsetX;
        const targetY = core.y + hand.targetOffsetY;

        const dx = targetX - hand.x;
        const dy = targetY - hand.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Contrainte plus serrée : max 35px au lieu de 60px
        const maxDist = 35;
        const springStrength = 0.3; // Force de rappel plus forte
        
        if (dist > maxDist) {
            const springForce = (dist - maxDist) * springStrength;
            hand.vx += (dx / dist) * springForce;
            hand.vy += (dy / dist) * springForce;
        } else {
            // Même quand proche, appliquer une force de rappel douce pour maintenir la position
            const softSpring = 0.15;
            hand.vx += dx * softSpring;
            hand.vy += dy * softSpring;
        }

        // Amortissement plus fort pour éviter les oscillations
        hand.vx *= 0.8;
        hand.vy *= 0.8;

        hand.x += hand.vx;
        hand.y += hand.vy;
    }

    getRagdollState(playerId) {
        return this.ragdolls.get(playerId);
    }

    destroyRagdoll(playerId) {
        this.ragdolls.delete(playerId);
    }
}
