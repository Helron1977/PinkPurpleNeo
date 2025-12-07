/**
 * RagdollClientService
 * 
 * Service côté client pour gérer les états ragdoll
 * Gère l'interpolation et fournit les états pour le rendu
 */

export class RagdollClientService {
    constructor() {
        this.ragdolls = new Map(); // playerId -> ragdoll state
    }

    createRagdoll(playerId) {
        this.ragdolls.set(playerId, {
            enabled: false,
            core: { x: 0, y: 0, deformX: 1, deformY: 1, deformAngle: 0, rotation: 0 },
            leftHand: { x: 0, y: 0 },
            rightHand: { x: 0, y: 0 },
            batAngle: 0
        });
    }

    updateFromPlayer(playerId, player) {
        const ragdoll = this.ragdolls.get(playerId);
        if (!ragdoll) return;

        // Update positions from player (mode normal)
        ragdoll.core.x = player.x;
        ragdoll.core.y = player.y;
        ragdoll.core.deformX = 1.0;
        ragdoll.core.deformY = 1.0;
        ragdoll.core.rotation = 0;

        // Mains en position normale
        const facing = player.facing || 1;
        ragdoll.leftHand.x = player.x - 20 * facing;
        ragdoll.leftHand.y = player.y + 10;
        ragdoll.rightHand.x = player.x + 20 * facing;
        ragdoll.rightHand.y = player.y + 10;
        ragdoll.batAngle = facing === 1 ? -Math.PI / 4 : Math.PI + Math.PI / 4;
    }

    getRagdollState(playerId) {
        return this.ragdolls.get(playerId);
    }

    setEnabled(playerId, enabled) {
        const ragdoll = this.ragdolls.get(playerId);
        if (ragdoll) {
            ragdoll.enabled = enabled;
        }
    }

    destroyRagdoll(playerId) {
        this.ragdolls.delete(playerId);
    }
}
