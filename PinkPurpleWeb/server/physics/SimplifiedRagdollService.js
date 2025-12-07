/**
 * SimplifiedRagdollService
 * 
 * Service de ragdoll simplifié pour personnage sphérique
 * Gère déformations, mains flottantes, et physique de rebond
 */

class SimplifiedRagdollService {
    constructor(config) {
        this.gravity = config.gravity || 8;
        this.timeStep = config.timeStep || 1 / 60;
        this.ragdolls = new Map();
    }

    createRagdoll(playerId, x, y, facingRight) {
        const ragdoll = {
            // État actif
            enabled: false,
            recoveryTimer: 0,

            // Corps principal (sphère)
            core: {
                x: x,
                y: y,
                vx: 0,
                vy: 0,
                radius: 25,
                rotation: 0,
                angularVelocity: 0,
                // Déformation (squash & stretch)
                deformX: 1.0,
                deformY: 1.0,
                deformAngle: 0,
                deformVelX: 0,
                deformVelY: 0
            },

            // Main gauche
            leftHand: {
                x: x - 20,
                y: y + 10,
                vx: 0,
                vy: 0,
                radius: 8,
                targetOffsetX: -20,
                targetOffsetY: 10
            },

            // Main droite
            rightHand: {
                x: x + 20,
                y: y + 10,
                vx: 0,
                vy: 0,
                radius: 8,
                targetOffsetX: 20,
                targetOffsetY: 10
            },

            // Batte
            batAngle: facingRight ? -Math.PI / 4 : Math.PI + Math.PI / 4,
            batAngularVelocity: 0,

            facing: facingRight ? 1 : -1
        };

        this.ragdolls.set(playerId, ragdoll);
        return ragdoll;
    }

    applyImpact(playerId, impactAngle, force, contactPoint) {
        const ragdoll = this.ragdolls.get(playerId);
        if (!ragdoll) return;

        // Activer ragdoll
        ragdoll.enabled = true;
        ragdoll.recoveryTimer = 2000; // 2 secondes

        // Calculer vélocités
        const vx = Math.cos(impactAngle) * force;
        const vy = Math.sin(impactAngle) * force;

        // Appliquer au corps
        ragdoll.core.vx = vx;
        ragdoll.core.vy = vy;

        // Rotation basée sur la direction
        ragdoll.core.angularVelocity = vx * 0.02;

        // Déformation immédiate (compression dans direction impact)
        ragdoll.core.deformAngle = impactAngle;
        ragdoll.core.deformX = 0.7; // Compressé
        ragdoll.core.deformY = 1.3; // Étiré perpendiculairement

        // Mains partent avec inertie réduite + écartées
        const handImpactFactor = 0.6;
        ragdoll.leftHand.vx = vx * handImpactFactor - 3; // Écartées vers l'extérieur
        ragdoll.leftHand.vy = vy * handImpactFactor - 5; // Vers le haut

        ragdoll.rightHand.vx = vx * handImpactFactor + 3;
        ragdoll.rightHand.vy = vy * handImpactFactor - 5;

        // Batte tourne
        ragdoll.batAngularVelocity = (Math.random() - 0.5) * 0.4;
    }

    update(deltaTime) {
        for (const [playerId, ragdoll] of this.ragdolls) {
            if (!ragdoll.enabled) continue;

            this.updateRagdoll(ragdoll, deltaTime);

            // Décrémenter timer de récupération
            ragdoll.recoveryTimer -= deltaTime * 1000;
            if (ragdoll.recoveryTimer <= 0) {
                ragdoll.enabled = false;
            }
        }
    }

    updateRagdoll(ragdoll, deltaTime) {
        const core = ragdoll.core;

        // === PHYSIQUE DU CORPS ===

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

        // Déformation - retour élastique vers normal (spring)
        const deformSpring = 0.15;
        const deformDamping = 0.9;

        core.deformVelX += (1.0 - core.deformX) * deformSpring;
        core.deformVelY += (1.0 - core.deformY) * deformSpring;
        core.deformVelX *= deformDamping;
        core.deformVelY *= deformDamping;

        core.deformX += core.deformVelX;
        core.deformY += core.deformVelY;

        // Clamp déformation (éviter valeurs impossibles)
        core.deformX = Math.max(0.5, Math.min(1.5, core.deformX));
        core.deformY = Math.max(0.5, Math.min(1.5, core.deformY));

        // === COLLISION SOL ===
        const GROUND_Y = 1080 - 40; // HEIGHT - marge
        if (core.y + core.radius > GROUND_Y) {
            core.y = GROUND_Y - core.radius;
            core.vy *= -0.5; // Rebond avec perte d'énergie

            // Déformation squash au sol
            core.deformY = 0.6;
            core.deformX = 1.4;
            core.deformAngle = Math.PI / 2;

            // Friction au sol
            core.vx *= 0.85;
            core.angularVelocity *= 0.8;
        }

        // === PHYSIQUE DES MAINS (Spring vers corps) ===
        this.updateHand(ragdoll.leftHand, core);
        this.updateHand(ragdoll.rightHand, core);

        // === BATTE ===
        ragdoll.batAngle += ragdoll.batAngularVelocity;
        ragdoll.batAngularVelocity *= 0.98;
    }

    updateHand(hand, core) {
        // Gravité sur main
        hand.vy += this.gravity;

        // Air resistance
        hand.vx *= 0.95;
        hand.vy *= 0.95;

        // Spring vers position relative au corps
        const targetX = core.x + hand.targetOffsetX;
        const targetY = core.y + hand.targetOffsetY;

        const dx = targetX - hand.x;
        const dy = targetY - hand.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Force de rappel si trop loin
        const maxDist = 60;
        if (dist > maxDist) {
            const springForce = (dist - maxDist) * 0.1;
            hand.vx += (dx / dist) * springForce;
            hand.vy += (dy / dist) * springForce;
        }

        // Damping
        hand.vx *= 0.85;
        hand.vy *= 0.85;

        // Position
        hand.x += hand.vx;
        hand.y += hand.vy;
    }

    getRagdollState(playerId) {
        return this.ragdolls.get(playerId);
    }

    setRagdollEnabled(playerId, enabled) {
        const ragdoll = this.ragdolls.get(playerId);
        if (ragdoll) {
            ragdoll.enabled = enabled;
        }
    }

    destroyRagdoll(playerId) {
        this.ragdolls.delete(playerId);
    }

    serializeRagdoll(playerId) {
        const ragdoll = this.ragdolls.get(playerId);
        if (!ragdoll) return null;

        // Format: 22 bytes
        const buf = Buffer.alloc(22);
        let offset = 0;

        // Flags
        let flags = 0;
        if (ragdoll.enabled) flags |= 1;
        buf.writeUInt8(flags, offset++);

        // Core position
        buf.writeInt16LE(Math.round(ragdoll.core.x * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.core.y * 10), offset); offset += 2;

        // Déformation (* 100 pour 2 décimales de précision)
        buf.writeUInt8(Math.round(ragdoll.core.deformX * 100), offset++);
        buf.writeUInt8(Math.round(ragdoll.core.deformY * 100), offset++);
        buf.writeInt16LE(Math.round(ragdoll.core.deformAngle * 1000), offset); offset += 2;

        // Rotation
        buf.writeInt16LE(Math.round(ragdoll.core.rotation * 1000), offset); offset += 2;

        // Mains
        buf.writeInt16LE(Math.round(ragdoll.leftHand.x * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.leftHand.y * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.rightHand.x * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.rightHand.y * 10), offset); offset += 2;

        // Batte
        buf.writeInt16LE(Math.round(ragdoll.batAngle * 1000), offset); offset += 2;

        return buf;
    }
}

module.exports = SimplifiedRagdollService;
