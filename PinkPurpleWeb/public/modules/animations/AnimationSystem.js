/**
 * PROCEDURAL ANIMATION SYSTEM
 * 
 * Un système purement mathématique pour gérer les mouvements des personnages.
 * Pas de simulation physique, tout est contrôlé par des courbes (Easing).
 */

export class AnimationSystem {
    constructor() {
        this.activeAnimations = new Map(); // playerId -> AnimationState
    }

    /**
     * Initialise l'état d'animation par défaut pour un joueur
     */
    initPlayer(id) {
        if (!this.activeAnimations.has(id)) {
            this.activeAnimations.set(id, {
                currentAction: null, // 'swing', 'stunned', 'dash', 'respawn'
                startTime: 0,
                duration: 0,
                params: {},
                
                // Visual Offsets (ce qui est rendu)
                offsets: {
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    handLeft: { x: 0, y: 0 },
                    handRight: { x: 0, y: 0 },
                    batAngle: 0,
                    opacity: 1
                }
            });
        }
    }

    /**
     * Déclenche une animation
     */
    trigger(id, type, params = {}) {
        this.initPlayer(id);
        const state = this.activeAnimations.get(id);

        // Règles de priorité (ex: un hit interrompt une attaque)
        if (state.currentAction === 'stunned' && type !== 'respawn') return; // On ne peut rien faire quand on est stun (sauf respawn)
        
        state.currentAction = type;
        state.startTime = Date.now();
        state.duration = params.duration || 500;
        state.params = params;
    }

    /**
     * Met à jour les valeurs visuelles pour un joueur
     * @param {string} id - Player ID
     * @param {Object} baseState - {x, y, facing, ...} du serveur
     */
    update(id, baseState, slowMotionFactor = 1.0) {
        this.initPlayer(id);
        const anim = this.activeAnimations.get(id);
        const now = Date.now();
        // Appliquer le ralenti : si slowMotionFactor < 1, l'animation avance plus lentement
        // On multiplie le temps écoulé par le facteur de ralenti
        const elapsed = (now - anim.startTime) * slowMotionFactor;
        const progress = Math.min(elapsed / anim.duration, 1);
        const t = progress; // Normalisé 0 -> 1

        // 1. Reset par défaut (Idle state)
        const facing = baseState.facing || 1;
        const time = now / 200;
        
        // Base Idle Animation (Respiration)
        const breathe = Math.sin(time) * 0.02;
        // Main gauche toujours à gauche, main droite toujours à droite (relatif au joueur)
        anim.offsets = {
            rotation: 0,
            scaleX: 1 + breathe,
            scaleY: 1 - breathe,
            handLeft: { x: -20 * facing, y: 10 + Math.sin(time) * 5 }, // Main gauche (arrière si facing right)
            handRight: { x: 25 * facing, y: 10 + Math.sin(time + 1) * 5 }, // Main droite (devant si facing right)
            batAngle: -Math.PI / 4, // Angle absolu, sera inversé au rendu si nécessaire
            opacity: 1
        };

        // Si aucune action ou action terminée
        if (!anim.currentAction) return anim.offsets;
        if (progress >= 1 && !anim.params.loop) {
            anim.currentAction = null;
            return anim.offsets;
        }

        // 2. Appliquer les courbes d'animation
        switch (anim.currentAction) {
            
            case 'swing':
                this.animSwing(anim, t, facing);
                break;

            case 'hit_received':
            case 'stunned':
                this.animStunned(anim, t, facing);
                break;

            case 'bounce':
                this.animBounce(anim, t);
                break;

            case 'dash':
                this.animDash(anim, t, facing);
                break;

            case 'victory_pose':
                this.animVictory(anim, now, facing);
                break;

            case 'respawn':
                this.animRespawn(anim, now);
                break;
        }

        return anim.offsets;
    }

    // --- COURBES D'ANIMATION ---

    animSwing(anim, t, facing) {
        // Coup de batte vraiment symétrique : même mouvement, juste inversé selon facing
        // 0.0 - 0.3 : Wind up (préparation arrière)
        // 0.3 - 0.5 : SWING (Frappe)
        // 0.5 - 1.0 : Recovery
        
        const swingDirection = anim.params.direction || 'horizontal'; // 'horizontal' ou 'up'
        
        // Déterminer quelle main tient la batte selon facing
        // IMPORTANT: Modifier directement les propriétés de handRight/handLeft selon facing
        if (swingDirection === 'up') {
            // Attaque vers le haut - Cercle complet commençant par le bas avec rotation du corps
            if (t < 0.25) { // Wind up - Commence par le bas
                const subT = t / 0.25;
                // Batte part du bas (3π/2) et remonte
                const startAngle = 3 * Math.PI / 2; // Bas (270°)
                const windupAngle = Math.PI / 2; // Remonte de 90°
                anim.offsets.batAngle = startAngle - windupAngle * subT; // De 270° à 180°
                
                // Rotation du corps pendant le windup
                anim.offsets.rotation = -0.2 * subT; // Légère rotation vers l'arrière
                
                if (facing === 1) {
                    anim.offsets.handRight.x = 25;
                    anim.offsets.handRight.y = 30 - 20 * subT; // Descend puis remonte
                } else {
                    anim.offsets.handLeft.x = -25;
                    anim.offsets.handLeft.y = 30 - 20 * subT;
                }
            } else if (t < 0.5) { // SMASH - Cercle complet (360°) - AMPLITUDE AUGMENTÉE
                const subT = (t - 0.25) / 0.25;
                const swing = 1 - Math.pow(1 - subT, 2);
                // Cercle complet : de 180° (windup) à 540° (fin = 180° + 360°)
                const startAngle = Math.PI; // 180°
                const endAngle = Math.PI + 2 * Math.PI; // 540° (un tour complet)
                anim.offsets.batAngle = startAngle + (endAngle - startAngle) * swing; // Cercle complet
                
                // Rotation du corps pendant le swing - PLUS PRONONCÉE
                anim.offsets.rotation = -0.3 + (0.6 * swing); // Rotation plus complète
                
                if (facing === 1) {
                    // AMPLITUDE AUGMENTÉE : de 30 à 50 pour rendre le mouvement plus visible
                    anim.offsets.handRight.x = 25 + 50 * Math.cos(swing * Math.PI * 2);
                    anim.offsets.handRight.y = 10 + 50 * Math.sin(swing * Math.PI * 2);
                } else {
                    anim.offsets.handLeft.x = -25 - 50 * Math.cos(swing * Math.PI * 2);
                    anim.offsets.handLeft.y = 10 + 50 * Math.sin(swing * Math.PI * 2);
                }
                anim.offsets.scaleX = 1.3; // Plus de déformation
                anim.offsets.scaleY = 0.8;
            } else { // Recovery - Retour à la position de départ
                const subT = (t - 0.5) / 0.5;
                // Retour progressif à l'angle de départ (idle)
                const endAngle = Math.PI + 2 * Math.PI; // 540° (fin du swing)
                const idleAngle = -Math.PI / 4; // Angle idle
                // Normaliser l'angle pour le retour
                let normalizedEnd = (endAngle % (2 * Math.PI)) - Math.PI; // -π à π
                anim.offsets.batAngle = normalizedEnd * (1 - subT) + idleAngle * subT;
                
                // Rotation du corps revient à 0
                anim.offsets.rotation = 0.2 * (1 - subT);
            }
        } else {
                // Attaque horizontale : demi-cercle symétrique (pas un cercle complet)
                // Même arc de demi-cercle pour gauche et droite
                if (t < 0.3) { // Wind up
                    const subT = t / 0.3;
                    // Recule la batte en arrière (même mouvement pour gauche et droite)
                    const baseAngle = -Math.PI/4; // Angle de départ (idle)
                    const windupAngle = Math.PI/2; // Recule de 90°
                    anim.offsets.batAngle = baseAngle - windupAngle * subT; // Angle absolu
                    if (facing === 1) {
                        anim.offsets.handRight.x = 25 - 10 * subT;
                        anim.offsets.handRight.y = 10 - 10 * subT;
                    } else {
                        // Pour la gauche, symétrie : recule vers la droite (négatif devient moins négatif)
                        anim.offsets.handLeft.x = -25 + 10 * subT;
                        anim.offsets.handLeft.y = 10 - 10 * subT;
                    }
                } else if (t < 0.5) { // SMASH - Demi-cercle (180°) - AMPLITUDE AUGMENTÉE
                    const subT = (t - 0.3) / 0.2;
                    const swing = 1 - Math.pow(1 - subT, 3);
                    // Demi-cercle : de -3π/4 (windup) à π/4 (fin du swing) = 180°
                    const startAngle = -3 * Math.PI / 4; // -135°
                    const endAngle = Math.PI / 4; // 45° (pas π/2 pour éviter le cercle complet)
                    anim.offsets.batAngle = startAngle + (endAngle - startAngle) * swing; // Angle absolu
                    if (facing === 1) {
                        // AMPLITUDE AUGMENTÉE : de 40 à 60 pour rendre le mouvement plus visible
                        anim.offsets.handRight.x = 25 + 60 * swing;
                        anim.offsets.handRight.y = 10 + 20 * swing; // Plus de mouvement vertical aussi
                    } else {
                        // Pour la gauche, symétrie : avance vers la gauche (négatif devient plus négatif)
                        anim.offsets.handLeft.x = -25 - 60 * swing; // Amplitude augmentée
                        anim.offsets.handLeft.y = 10 + 20 * swing;
                    }
                    anim.offsets.scaleX = 1.3; // Plus de déformation pour effet de vitesse
                    anim.offsets.scaleY = 0.7;
                } else { // Recovery
                    const subT = (t - 0.5) / 0.5;
                    const endAngle = Math.PI / 4;
                    const idleAngle = -Math.PI / 4;
                    anim.offsets.batAngle = endAngle * (1 - subT) + idleAngle * subT; // Angle absolu
                }
            }
    }

    animStunned(anim, t, facing) {
        // Touché !
        // Secousse violente + Rotation
        
        // Tremblement décroissant
        const shake = Math.sin(t * 50) * 10 * (1 - t);
        
        anim.offsets.rotation = (shake * 0.05); // Légère rotation
        anim.offsets.handLeft.x += shake;
        anim.offsets.handRight.x -= shake;
        
        // Mains en l'air (panique)
        anim.offsets.handLeft.y -= 20;
        anim.offsets.handRight.y -= 20;
        
        // Yeux gérés par le renderer (déjà implémenté) mais on peut ajouter offset
        anim.offsets.batAngle += Math.sin(t * 20) * 0.5; // Batte qui tremble
    }

    animBounce(anim, t) {
        // Effet Jelly au rebond
        // Sinusoide amortie
        const intensity = (1 - t);
        const wobble = Math.sin(t * Math.PI * 6) * 0.4 * intensity;
        
        anim.offsets.scaleX = 1 + wobble;
        anim.offsets.scaleY = 1 - wobble;
        // Rotation alignée avec le mouvement (géré par rendering si dispo, sinon 0)
    }

    animDash(anim, t, facing) {
        // Étirement horizontal
        const intensity = Math.sin(t * Math.PI); // Cloche
        anim.offsets.scaleX = 1 + (0.5 * intensity);
        anim.offsets.scaleY = 1 - (0.2 * intensity);
        
        // Mains en arrière
        anim.offsets.handLeft.x -= 20 * facing * intensity;
        anim.offsets.handRight.x -= 20 * facing * intensity;
    }

    animVictory(anim, now, facing) {
        // Pose de satisfaction : BRAS VERS LE CIEL (très visible)
        const loopT = (now / 400) % (Math.PI * 2);
        
        // Rire : secousse verticale (haut-bas) - PLUS PRONONCÉE
        const laughShake = Math.sin(loopT * 2) * 5;
        anim.offsets.scaleX = 1.2 + Math.sin(loopT) * 0.1; // Plus grand
        anim.offsets.scaleY = 1.2 + Math.cos(loopT) * 0.1;
        
        // BRAS BIEN LEVÉS VERS LE CIEL - AMPLITUDE AUGMENTÉE
        const armRaise = 60 + Math.sin(loopT) * 8; // De 40 à 60, beaucoup plus haut
        anim.offsets.handLeft.y -= armRaise; // Bras gauche très haut
        anim.offsets.handRight.y -= armRaise; // Bras droit très haut
        anim.offsets.handLeft.x -= 20 * facing; // Plus écartés (de 15 à 20)
        anim.offsets.handRight.x += 20 * facing;
        
        // Batte levée triomphalement (verticale) - PLUS HAUTE
        anim.offsets.batAngle = -Math.PI / 2;
        
        // Rotation de joie - PLUS PRONONCÉE
        anim.offsets.rotation = Math.sin(loopT * 0.5) * 0.15; // De 0.1 à 0.15
    }

    animRespawn(anim, now) {
        // Clignotement
        const blink = Math.floor(now / 200) % 2;
        anim.offsets.opacity = blink === 0 ? 0.3 : 1.0;
        
        // Flottement
        const float = Math.sin(now / 300) * 5;
        // Note: Le Y est géré par le renderer qui reçoit le offset, ici on modifie scale/hand
        anim.offsets.handLeft.y += float;
        anim.offsets.handRight.y += float;
    }
}

