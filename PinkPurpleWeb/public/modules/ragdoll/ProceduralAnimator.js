/**
 * ProceduralAnimator
 * 
 * Générateur d'animations procédurales
 * 
 * Responsabilités:
 * - Générer poses réalistes  
 * - Animer impacts, chutes, récupérations
 * - Pure functions (pas d'état interne)
 * 
 * Technologies: JavaScript ES6+, Math
 * Algorithmes: IK, spring physics, courbes d'animation
 * 
 * @module ProceduralAnimator
 */

export class ProceduralAnimator {
    /**
     * Génère une pose idle (stance normale)
     * @param {Object} ragdollState - État du ragdoll
     * @param {number} time - Temps en secondes
     * @param {number} facing - Direction (1 ou -1)
     * @returns {Object} État animé avec poses
     */
    generateIdlePose(ragdollState, time, facing) {
        const core = ragdollState.core;
        
        // Animation subtile de respiration
        const breathe = Math.sin(time * 2) * 0.05;
        const deformX = 1.0 + breathe;
        const deformY = 1.0 - breathe * 0.5;
        
        // Légère oscillation des mains (flottement)
        const handFloat = Math.sin(time * 1.5) * 3;
        const handSway = Math.cos(time * 1.2) * 2;
        
        // Positions des mains avec animation
        const leftHandOffsetX = -20 * facing + handSway;
        const leftHandOffsetY = 10 + handFloat;
        const rightHandOffsetX = 20 * facing - handSway;
        const rightHandOffsetY = 10 + handFloat;
        
        return {
            ...ragdollState,
            core: {
                ...core,
                deformX,
                deformY,
                deformAngle: 0
            },
            leftHand: {
                ...ragdollState.leftHand,
                targetOffsetX: leftHandOffsetX,
                targetOffsetY: leftHandOffsetY
            },
            rightHand: {
                ...ragdollState.rightHand,
                targetOffsetX: rightHandOffsetX,
                targetOffsetY: rightHandOffsetY
            },
            batAngle: facing === 1 ? -Math.PI / 4 : Math.PI + Math.PI / 4
        };
    }

    /**
     * Génère une pose stunned (étourdi) - AMÉLIORÉE
     * Pose plus expressive après un coup
     */
    generateStunnedPose(ragdollState, time, progress) {
        const core = ragdollState.core;
        
        // Tremblement et désorientation plus prononcés
        const shake = Math.sin(time * 25) * (1 - progress) * 3;
        const wobble = Math.cos(time * 18) * (1 - progress) * 2;
        
        // Déformation (comprimé horizontalement, légèrement étiré verticalement)
        const deformX = 0.85 + shake * 0.1; // Plus comprimé
        const deformY = 1.15 - wobble * 0.1; // Plus étiré
        const deformAngle = wobble * 0.15; // Plus de rotation
        
        // Mains qui pendent plus bas (faiblesse)
        const leftHandOffsetX = -18 + shake * 1.5;
        const leftHandOffsetY = 25 + wobble * 1.5; // Plus bas
        const rightHandOffsetX = 18 - shake * 1.5;
        const rightHandOffsetY = 25 + wobble * 1.5; // Plus bas
        
        // Rotation du corps (déséquilibre)
        const rotation = wobble * 0.08;
        
        // Batte qui pend mollement
        const batAngle = ragdollState.batAngle + shake * 0.2 - Math.PI / 6; // Vers le bas
        
        return {
            ...ragdollState,
            core: {
                ...core,
                deformX,
                deformY,
                deformAngle,
                rotation: core.rotation + rotation
            },
            leftHand: {
                ...ragdollState.leftHand,
                targetOffsetX: leftHandOffsetX,
                targetOffsetY: leftHandOffsetY
            },
            rightHand: {
                ...ragdollState.rightHand,
                targetOffsetX: rightHandOffsetX,
                targetOffsetY: rightHandOffsetY
            },
            batAngle: batAngle
        };
    }

    /**
     * Génère une pose de gloire (victory stance) - AMÉLIORÉE
     * Pose triomphante après un hit réussi
     */
    generateVictoryPose(ragdollState, time, facing) {
        const core = ragdollState.core;
        
        // Légère expansion (fierté)
        const breathe = Math.sin(time * 3) * 0.08;
        const deformX = 1.05 + breathe;
        const deformY = 1.05 + breathe;
        
        // Légère élévation (flottement)
        const floatY = Math.sin(time * 2) * 2;
        
        // Mains levées en signe de victoire
        const victoryWave = Math.sin(time * 4) * 5;
        const leftHandOffsetX = -25 * facing + victoryWave * 0.5;
        const leftHandOffsetY = -15 + floatY; // Levée
        const rightHandOffsetX = 30 * facing - victoryWave * 0.5;
        const rightHandOffsetY = -10 + floatY; // Levée avec batte
        
        // Batte levée en l'air
        const batAngle = facing === 1 ? -Math.PI / 2 : Math.PI / 2; // Vers le haut
        
        return {
            ...ragdollState,
            core: {
                ...core,
                deformX,
                deformY,
                deformAngle: 0,
                y: core.y + floatY * 0.3 // Légère élévation
            },
            leftHand: {
                ...ragdollState.leftHand,
                targetOffsetX: leftHandOffsetX,
                targetOffsetY: leftHandOffsetY
            },
            rightHand: {
                ...ragdollState.rightHand,
                targetOffsetX: rightHandOffsetX,
                targetOffsetY: rightHandOffsetY
            },
            batAngle: batAngle
        };
    }

    /**
     * Anime un impact
     * @param {Object} ragdollState - État du ragdoll
     * @param {Object} impact - Impact data
     * @param {number} impact.angle - Angle de l'impact
     * @param {number} impact.force - Force
     * @param {Object} impact.contactPoint - Point de contact {x, y}
     * @returns {Object} État animé (copie modifiée)
     */
    animateImpact(ragdollState, impact) {
        // Utilisé par le système de physique, pas besoin d'implémentation ici
        return ragdollState;
    }

    /**
     * Anime une chute
     * @param {Object} ragdollState - État du ragdoll
     * @param {number} progress - Progression (0-1)
     * @returns {Object} État animé
     */
    animateFall(ragdollState, progress) {
        // Animation de chute (mains qui s'agitent)
        const flail = Math.sin(progress * Math.PI * 4) * 10 * (1 - progress);
        
        return {
            ...ragdollState,
            leftHand: {
                ...ragdollState.leftHand,
                targetOffsetX: ragdollState.leftHand.targetOffsetX + flail,
                targetOffsetY: ragdollState.leftHand.targetOffsetY + Math.abs(flail) * 0.5
            },
            rightHand: {
                ...ragdollState.rightHand,
                targetOffsetX: ragdollState.rightHand.targetOffsetX - flail,
                targetOffsetY: ragdollState.rightHand.targetOffsetY + Math.abs(flail) * 0.5
            }
        };
    }

    /**
     * Anime une récupération (retour debout)
     * @param {Object} ragdollState - État du ragdoll
     * @param {number} progress - Progression (0-1)
     * @returns {Object} État animé
     */
    animateRecovery(ragdollState, progress) {
        // Transition douce vers la pose idle
        const ease = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        
        const core = ragdollState.core;
        const deformX = core.deformX + (1.0 - core.deformX) * ease;
        const deformY = core.deformY + (1.0 - core.deformY) * ease;
        
        return {
            ...ragdollState,
            core: {
                ...core,
                deformX,
                deformY,
                deformAngle: core.deformAngle * (1 - ease),
                rotation: core.rotation * (1 - ease)
            }
        };
    }

    /**
     * Anime un mouvement de batte
     * @param {Object} ragdollState - État du ragdoll
     * @param {number} swingPhase - Phase du swing (0-1)
     * @param {number} facing - Direction (1 ou -1)
     * @returns {Object} État animé
     */
    animateBatSwing(ragdollState, swingPhase, facing) {
        // Arc de swing
        const swingAngle = -Math.PI / 4 + (Math.PI / 2) * swingPhase;
        const batAngle = facing === 1 ? swingAngle : Math.PI - swingAngle;
        
        // Mains qui suivent le mouvement
        const handFollow = swingPhase * 10;
        const leftHandOffsetX = -20 * facing - handFollow * facing;
        const rightHandOffsetX = 20 * facing - handFollow * facing;
        
        return {
            ...ragdollState,
            batAngle,
            leftHand: {
                ...ragdollState.leftHand,
                targetOffsetX: leftHandOffsetX
            },
            rightHand: {
                ...ragdollState.rightHand,
                targetOffsetX: rightHandOffsetX
            }
        };
    }
}
