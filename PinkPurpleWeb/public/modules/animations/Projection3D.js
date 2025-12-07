/**
 * Projection3D Module
 * Système simple de calcul 3D et projection isométrique en 2D
 * Utilisé pour calculer les positions 3D des éléments du personnage
 * et les projeter en coordonnées 2D pour le rendu canvas classique
 */

export class Projection3D {
    constructor() {
        // Angle de vue isométrique (même que Zdog)
        this.viewAngleX = -Math.PI / 6; // -30 degrés
        this.viewAngleY = Math.PI / 4;  // 45 degrés
    }

    /**
     * Projette un point 3D (x, y, z) en coordonnées 2D (x, y)
     * Utilise une projection isométrique simple
     */
    project(x, y, z) {
        // Rotation autour de l'axe Y
        const cosY = Math.cos(this.viewAngleY);
        const sinY = Math.sin(this.viewAngleY);
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        // Rotation autour de l'axe X
        const cosX = Math.cos(this.viewAngleX);
        const sinX = Math.sin(this.viewAngleX);
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        // Projection orthographique (on ignore z2 pour la profondeur visuelle)
        return {
            x: x1,
            y: y1,
            z: z2 // Pour déterminer ce qui est devant/derrière
        };
    }

    /**
     * Calcule la position projetée d'un point 3D relatif à un centre
     */
    projectRelative(centerX, centerY, centerZ, offsetX, offsetY, offsetZ) {
        const projected = this.project(offsetX, offsetY, offsetZ);
        return {
            x: centerX + projected.x,
            y: centerY + projected.y,
            z: centerZ + projected.z
        };
    }

    /**
     * Calcule la rotation 3D d'un vecteur autour de l'axe Z
     */
    rotateZ(x, y, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: x * cos - y * sin,
            y: x * sin + y * cos
        };
    }

    /**
     * Calcule la position d'un point après rotation 3D (axe Z)
     * puis projection
     */
    projectRotated(centerX, centerY, centerZ, offsetX, offsetY, offsetZ, rotationZ) {
        // Rotation autour de Z
        const rotated = this.rotateZ(offsetX, offsetY, rotationZ);
        
        // Projection
        return this.projectRelative(centerX, centerY, centerZ, rotated.x, rotated.y, offsetZ);
    }
}

