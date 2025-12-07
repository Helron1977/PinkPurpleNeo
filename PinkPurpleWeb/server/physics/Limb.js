/**
 * Limb
 * 
 * Membre individuel du corps (segment)
 * 
 * Responsabilités:
 * - Physique 2D d'un segment rigide
 * - Position, rotation, vélocités
 * - Détection de collision
 * 
 * Algorithmes: Verlet integration recommandé pour stabilité
 * 
 * @module Limb
 */

class Limb {
    /**
     * Crée un membre
     * @param {string} name - Nom du membre
     * @param {number} length - Longueur du membre (pixels)
     * @param {number} mass - Masse du membre
     * @param {number} x - Position X initiale (centre)
     * @param {number} y - Position Y initiale (centre)
     * @param {number} angle - Angle initial (radians)
     */
    constructor(name, length, mass, x, y, angle) {
        // TODO: À implémenter par IA spécialisée

        this.name = name;
        this.length = length;
        this.mass = mass;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
    }

    /**
     * Points d'extrémité du membre (calculés)
     * @returns {Object} {start: {x, y}, end: {x, y}}
     */
    getEndPoints() {
        // TODO: À implémenter par IA spécialisée
        throw new Error('Not implemented');
    }

    /**
     * Applique une force au membre
     * @param {number} fx - Force X
     * @param {number} fy - Force Y
     * @param {Object} point - Point d'application {x, y}
     */
    applyForce(fx, fy, point) {
        // TODO: À implémenter par IA spécialisée
        throw new Error('Not implemented');
    }

    /**
     * Met à jour la physique
     * @param {number} deltaTime
     */
    update(deltaTime) {
        // TODO: À implémenter par IA spécialisée
        throw new Error('Not implemented');
    }

    /**
     * Vérifie collision avec un obstacle
     * @param {Object} obstacle - {x, y, w, h}
     * @returns {boolean}
     */
    checkCollision(obstacle) {
        // TODO: À implémenter par IA spécialisée
        throw new Error('Not implemented');
    }
}

module.exports = Limb;
