/**
 * ZdogAnimationSystem Module
 * Système d'animations 3D spécifique pour Zdog
 */

export class ZdogAnimationSystem {
    constructor() {
        this.activeAnimations = new Map(); // playerId -> { type, startTime, duration, params }
    }

    // Déclencher une animation
    trigger(playerId, type, params = {}) {
        this.activeAnimations.set(playerId, {
            type: type,
            startTime: Date.now(),
            duration: params.duration || 300,
            params: params
        });
    }

    // Mettre à jour et obtenir l'état d'animation pour un joueur
    update(playerId, playerState, slowMotionFactor = 1.0) {
        const anim = this.activeAnimations.get(playerId);
        if (!anim) {
            // Retourner état idle par défaut
            return this.getIdleState(playerState);
        }

        const now = Date.now();
        const elapsed = (now - anim.startTime) * slowMotionFactor;
        const progress = Math.min(1, elapsed / anim.duration);

        // Si l'animation est terminée, la supprimer
        if (progress >= 1) {
            this.activeAnimations.delete(playerId);
            return this.getIdleState(playerState);
        }

        // Calculer l'état selon le type d'animation
        switch (anim.type) {
            case 'swing':
                return this.getSwingState(anim, progress, playerState);
            case 'stunned':
                return this.getStunnedState(anim, progress, playerState);
            case 'victory':
                return this.getVictoryState(anim, progress, playerState);
            case 'bounce':
                return this.getBounceState(anim, progress, playerState);
            default:
                return this.getIdleState(playerState);
        }
    }

    // État idle (respiration, flottement)
    getIdleState(playerState) {
        const time = Date.now() / 200;
        const facing = playerState.facing || 1;
        const breathe = Math.sin(time) * 0.08; // Respiration visible (8%)

        // Calculer regard des yeux
        const lookX = facing * 8;
        const lookY = 0;

        return {
            rotation: 0,
            scaleX: 1 + breathe,
            scaleY: 1 - breathe,
            handLeft: {
                x: -20 * facing,
                y: 10 + Math.sin(time) * 5,
                z: 0
            },
            handRight: {
                x: 25 * facing,
                y: 10 + Math.sin(time + 1) * 5,
                z: 0
            },
            batAngle: -Math.PI / 4,
            eyeLookX: lookX,
            eyeLookY: lookY,
            isStunned: false
        };
    }

    // État swing (attaque)
    getSwingState(anim, progress, playerState) {
        const facing = playerState.facing || 1;
        const direction = anim.params.direction || 'horizontal';
        
        // Déterminer la direction réelle
        let attackDirection = direction;
        if (direction === 'horizontal') {
            attackDirection = (facing === 1) ? 'right' : 'left';
        }

        const t = progress;
        let handRight = { x: 25 * facing, y: 10, z: 0 };
        let handLeft = { x: -20 * facing, y: 10, z: 0 };
        let batAngle = -Math.PI / 4;
        let rotation = 0;
        let scaleX = 1;
        let scaleY = 1;

        if (attackDirection === 'up') {
            // Attaque vers le haut : cercle complet
            if (t < 0.25) {
                // Wind up
                const subT = t / 0.25;
                handRight.x = 25 * facing;
                handRight.y = 30 - 25 * subT;
                batAngle = (3 * Math.PI / 2) - (subT * Math.PI / 2);
                rotation = -0.25 * subT;
            } else if (t < 0.45) {
                // SMASH - Cercle complet
                const subT = (t - 0.25) / 0.2;
                const swing = 1 - Math.pow(1 - subT, 2);
                batAngle = Math.PI + (swing * Math.PI * 2);
                const radius = 55;
                handRight.x = (25 * facing) + radius * Math.cos(swing * Math.PI * 2) * facing;
                handRight.y = 10 + radius * Math.sin(swing * Math.PI * 2);
                rotation = -0.25 + (0.5 * swing);
                scaleX = 1.25;
                scaleY = 0.85;
            } else {
                // Recovery
                const subT = (t - 0.45) / 0.55;
                batAngle = ((Math.PI + 2 * Math.PI) % (2 * Math.PI)) * (1 - subT) + (-Math.PI / 4) * subT;
                rotation = 0.25 * (1 - subT);
            }
        } else if (attackDirection === 'right') {
            // Attaque vers la droite : demi-cercle
            if (t < 0.25) {
                const subT = t / 0.25;
                handRight.x = (25 - 15 * subT) * facing;
                handRight.y = 10 - 15 * subT;
                batAngle = (-Math.PI / 4) - (subT * Math.PI / 2);
            } else if (t < 0.45) {
                const subT = (t - 0.25) / 0.2;
                const swing = 1 - Math.pow(1 - subT, 3);
                batAngle = (-3 * Math.PI / 4) + (swing * Math.PI / 2);
                handRight.x = (25 + 70 * swing) * facing;
                handRight.y = 10 + 25 * swing;
                scaleX = 1.3;
                scaleY = 0.7;
            } else {
                const subT = (t - 0.45) / 0.55;
                batAngle = (Math.PI / 4) * (1 - subT) + (-Math.PI / 4) * subT;
            }
        } else {
            // Attaque vers la gauche : demi-cercle symétrique
            if (t < 0.25) {
                const subT = t / 0.25;
                handLeft.x = (-25 + 15 * subT) * facing;
                handLeft.y = 10 - 15 * subT;
                batAngle = (-Math.PI / 4) + (subT * Math.PI / 2);
            } else if (t < 0.45) {
                const subT = (t - 0.25) / 0.2;
                const swing = 1 - Math.pow(1 - subT, 3);
                batAngle = (3 * Math.PI / 4) - (swing * Math.PI / 2);
                handLeft.x = (-25 - 70 * swing) * facing;
                handLeft.y = 10 + 25 * swing;
                scaleX = 1.3;
                scaleY = 0.7;
            } else {
                const subT = (t - 0.45) / 0.55;
                batAngle = (-Math.PI / 4) * (1 - subT) + (-Math.PI / 4) * subT;
            }
        }

        // Calculer regard des yeux (vers l'adversaire ou direction)
        const lookX = facing * 8;
        const lookY = 0;

        return {
            rotation,
            scaleX,
            scaleY,
            handLeft,
            handRight,
            batAngle,
            eyeLookX: lookX,
            eyeLookY: lookY,
            isStunned: false
        };
    }

    // État stunned (étourdissement)
    getStunnedState(anim, progress, playerState) {
        const time = Date.now() / 100;
        const facing = playerState.facing || 1;
        
        // Tremblement
        const shake = Math.sin(time * 10) * 2;
        const wobble = Math.sin(time * 8) * 0.1;

        return {
            rotation: wobble,
            scaleX: 1 + wobble,
            scaleY: 1 - wobble,
            handLeft: {
                x: (-20 * facing) + shake,
                y: 10 + Math.sin(time) * 5 + shake,
                z: 0
            },
            handRight: {
                x: (25 * facing) + shake,
                y: 10 + Math.sin(time + 1) * 5 + shake,
                z: 0
            },
            batAngle: -Math.PI / 4,
            eyeLookX: 0,
            eyeLookY: 0,
            isStunned: true
        };
    }

    // État victory (pose de victoire)
    getVictoryState(anim, progress, playerState) {
        const time = Date.now() / 400;
        const facing = playerState.facing || 1;
        const loopT = (time % (Math.PI * 2));
        
        // Rire : secousse verticale
        const laughShake = Math.sin(loopT * 2) * 5;
        const scale = 1.2 + Math.sin(loopT) * 0.1;

        // Bras levés
        const armRaise = 60 + Math.sin(loopT) * 8;

        return {
            rotation: Math.sin(loopT * 0.5) * 0.15,
            scaleX: scale,
            scaleY: scale,
            handLeft: {
                x: (-20 * facing) - (20 * facing),
                y: 10 - armRaise + laughShake,
                z: 0
            },
            handRight: {
                x: (25 * facing) + (20 * facing),
                y: 10 - armRaise + laughShake,
                z: 0
            },
            batAngle: -Math.PI / 2, // Batte levée verticalement
            eyeLookX: 0,
            eyeLookY: -10, // Regard vers le haut
            isStunned: false
        };
    }

    // État bounce (rebond)
    getBounceState(anim, progress, playerState) {
        const intensity = (1 - progress);
        const wobble = Math.sin(progress * Math.PI * 10) * intensity * 0.25;
        const facing = playerState.facing || 1;

        return {
            rotation: 0,
            scaleX: 1 + wobble,
            scaleY: 1 - wobble,
            handLeft: {
                x: -20 * facing,
                y: 10,
                z: 0
            },
            handRight: {
                x: 25 * facing,
                y: 10,
                z: 0
            },
            batAngle: -Math.PI / 4,
            eyeLookX: 0,
            eyeLookY: 0,
            isStunned: false
        };
    }

    // Mapper les animations existantes vers le système Zdog
    mapFromLegacyAnim(legacyAnim, playerState) {
        if (!legacyAnim) return null;

        const elapsed = Date.now() - legacyAnim.startTime;
        if (elapsed >= legacyAnim.duration) return null;

        switch (legacyAnim.type) {
            case 'bat_swing':
                return {
                    type: 'swing',
                    startTime: legacyAnim.startTime,
                    duration: legacyAnim.duration,
                    params: { direction: 'horizontal' }
                };
            case 'stunned':
                return {
                    type: 'stunned',
                    startTime: legacyAnim.startTime,
                    duration: legacyAnim.duration || 1500,
                    params: {}
                };
            case 'deformation':
                return {
                    type: 'bounce',
                    startTime: legacyAnim.startTime,
                    duration: legacyAnim.duration || 300,
                    params: {}
                };
            default:
                return null;
        }
    }
}

