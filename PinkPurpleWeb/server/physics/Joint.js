/**
 * Joint
 * 
 * Articulation contrainte entre deux membres
 * 
 * Responsabilités:
 * - Contraintes angulaires (min/max)
 * - Forces de rappel (spring)
 * - Résolution de contraintes
 * 
 * Algorithmes: Position Based Dynamics ou contraintes géométriques
 * 
 * @module Joint
 */

class Joint {
    /**
     * Crée une articulation
     * @param {Limb} limbA - Premier membre
     * @param {Limb} limbB - Second membre
     * @param {Object} config - Configuration
     * @param {number} config.minAngle - Angle minimum (radians)
     * @param {number} config.maxAngle - Angle maximum (radians)
     * @param {number} config.stiffness - Rigidité (0-1)
     * @param {number} config.damping - Amortissement (0-1)
     */
    constructor(limbA, limbB, config) {
        // TODO: À implémenter par IA spécialisée

        this.limbA = limbA;
        this.limbB = limbB;
        this.minAngle = config.minAngle;
        this.maxAngle = config.maxAngle;
        this.stiffness = config.stiffness;
        this.damping = config.damping;
        this.anchor = { x: 0, y: 0 }; // À calculer
        this.currentAngle = 0;
    }

    /**
     * Résout les contraintes de l'articulation
     * Force les membres à respecter les limites angulaires
     */
    solve() {
        // TODO: À implémenter par IA spécialisée
        throw new Error('Not implemented');
    }

    /**
     * Applique une force de rappel (spring)
     * @param {number} targetAngle - Angle cible
     * @param {number} strength - Force du ressort
     */
    applySpringForce(targetAngle, strength) {
        // TODO: À implémenter par IA spécialisée
        throw new Error('Not implemented');
    }
}

module.exports = Joint;
