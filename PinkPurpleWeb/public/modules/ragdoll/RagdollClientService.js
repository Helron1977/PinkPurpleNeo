/**
 * RagdollClientService
 * 
 * Service côté client avec physique locale
 * Ne reçoit que les triggers d'activation
 */

import { ClientRagdollPhysics } from './ClientRagdollPhysics.js';
import { ProceduralAnimator } from './ProceduralAnimator.js';

export class RagdollClientService {
    constructor() {
        this.physics = new ClientRagdollPhysics();
        this.animator = new ProceduralAnimator();
        this.lastUpdateTime = performance.now();
        this.startTime = performance.now();
        this.frozenRagdolls = new Map(); // Cache pour hit stop
        this.isFrozen = false;
    }

    createRagdoll(playerId, x, y, facingRight) {
        this.physics.createRagdoll(playerId, x, y, facingRight);
    }

    /**
     * Active le ragdoll suite à un événement serveur
     */
    activateFromEvent(playerId, event) {
        // event = {impactAngle, force, x, y, contactX, contactY, angularVelocity}
        this.physics.activateRagdoll(
            playerId,
            event.impactAngle,
            event.force,
            event.x,
            event.y,
            event.angularVelocity || null,
            event.contactX || null,
            event.contactY || null
        );
    }

    /**
     * Gèle le ragdoll (pendant hit stop)
     */
    freezeRagdoll(playerId) {
        const ragdoll = this.physics.getRagdollState(playerId);
        if (ragdoll) {
            this.frozenRagdolls.set(playerId, JSON.parse(JSON.stringify(ragdoll)));
        }
    }

    /**
     * Démarre le gel (hit stop)
     */
    startFreeze() {
        this.isFrozen = true;
        // Geler tous les ragdolls actifs (on doit les identifier autrement)
        // On gèlera au moment où on les récupère dans getRagdollState
    }

    /**
     * Arrête le gel (fin hit stop)
     */
    stopFreeze() {
        this.isFrozen = false;
        this.frozenRagdolls.clear();
    }

    /**
     * Update physique locale (appelé chaque frame)
     */
    update(isFrozen = false) {
        // Ne pas mettre à jour la physique si gelé
        if (isFrozen) {
            return;
        }

        const now = performance.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;

        this.physics.update(deltaTime);
    }

    /**
     * Obtient l'état du ragdoll avec animations procédurales pour les poses
     */
    getRagdollState(playerId, playerState = null, isFrozen = false) {
        // Si gelé, utiliser le cache
        if (isFrozen && this.frozenRagdolls.has(playerId)) {
            return this.frozenRagdolls.get(playerId);
        }
        
        let ragdoll = this.physics.getRagdollState(playerId);
        
        if (!ragdoll) return null;

        // Si gelé et ragdoll actif, le geler maintenant
        if (isFrozen && ragdoll.enabled && !this.frozenRagdolls.has(playerId)) {
            this.freezeRagdoll(playerId);
            ragdoll = this.frozenRagdolls.get(playerId);
        }

        // Appliquer animations procédurales pour les poses (victory stance, stunned)
        // SEULEMENT si le ragdoll n'est pas activé (pas de physique en cours)
        if (!ragdoll.enabled && playerState && !isFrozen) {
            const time = (performance.now() - this.startTime) / 1000;
            const facing = playerState.facing || 1;
            
            // Victory stance
            if (playerState.victoryStance) {
                ragdoll = this.animator.generateVictoryPose(ragdoll, time, facing);
            }
            // Stunned (après un coup)
            else if (playerState.isHit) {
                const stunnedProgress = Math.min(1.0, (time % 1.5) / 1.5); // Cycle de 1.5 secondes
                ragdoll = this.animator.generateStunnedPose(ragdoll, time, stunnedProgress);
            }
        }

        return ragdoll;
    }

    destroyRagdoll(playerId) {
        this.physics.destroyRagdoll(playerId);
        this.frozenRagdolls.delete(playerId);
    }
}
