/**
 * Bot Vision - Système de vision par ray casting pour le bot
 * Permet au bot de "voir" son environnement (obstacles, ennemis, etc.)
 */

class BotVision {
    constructor(gameRoom) {
        this.room = gameRoom;
        this.rayCount = 8; // Nombre de rayons pour la vision
        this.maxRayDistance = 500; // Distance maximale de vision
    }

    /**
     * Effectue un ray cast dans une direction donnée
     * Retourne la distance jusqu'au premier obstacle ou la distance max
     */
    raycast(startX, startY, angle) {
        const stepSize = 5; // Précision du ray cast
        const maxSteps = this.maxRayDistance / stepSize;
        
        let x = startX;
        let y = startY;
        const dx = Math.cos(angle) * stepSize;
        const dy = Math.sin(angle) * stepSize;
        
        for (let i = 0; i < maxSteps; i++) {
            x += dx;
            y += dy;
            
            // Vérifier les limites de l'écran
            if (x < 0 || x > 1920 || y < 0 || y > 1080) {
                return i * stepSize;
            }
            
            // Vérifier collision avec obstacles
            if (this.room && this.room.obstacles) {
                for (const obs of this.room.obstacles) {
                    if (x >= obs.x && x <= obs.x + obs.w &&
                        y >= obs.y && y <= obs.y + obs.h) {
                        return i * stepSize;
                    }
                }
            }
        }
        
        return this.maxRayDistance;
    }

    /**
     * Obtient une "vision" complète autour du bot
     * Retourne un tableau de distances pour chaque direction
     */
    getVision(botX, botY) {
        const vision = [];
        const angleStep = (2 * Math.PI) / this.rayCount;
        
        for (let i = 0; i < this.rayCount; i++) {
            const angle = i * angleStep;
            const distance = this.raycast(botX, botY, angle);
            vision.push({
                angle: angle,
                distance: distance,
                normalized: distance / this.maxRayDistance // 0-1
            });
        }
        
        return vision;
    }

    /**
     * Obtient la direction libre la plus proche d'une direction cible
     * Utile pour éviter les obstacles tout en se dirigeant vers un objectif
     */
    getBestDirection(botX, botY, targetAngle) {
        const vision = this.getVision(botX, botY);
        
        // Trouver la direction avec la plus grande distance libre
        let bestIndex = 0;
        let maxDistance = 0;
        
        for (let i = 0; i < vision.length; i++) {
            if (vision[i].distance > maxDistance) {
                maxDistance = vision[i].distance;
                bestIndex = i;
            }
        }
        
        // Calculer la différence d'angle avec la cible
        const bestAngle = vision[bestIndex].angle;
        let angleDiff = Math.abs(bestAngle - targetAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        
        // Si la direction libre est proche de la cible, l'utiliser
        if (angleDiff < Math.PI / 4) { // 45 degrés
            return bestAngle;
        }
        
        // Sinon, trouver une direction libre proche de la cible
        let closestIndex = 0;
        let minAngleDiff = Math.PI;
        
        for (let i = 0; i < vision.length; i++) {
            if (vision[i].distance > 100) { // Au moins 100px libre
                let diff = Math.abs(vision[i].angle - targetAngle);
                if (diff > Math.PI) diff = 2 * Math.PI - diff;
                if (diff < minAngleDiff) {
                    minAngleDiff = diff;
                    closestIndex = i;
                }
            }
        }
        
        return vision[closestIndex].angle;
    }

    /**
     * Vérifie si une trajectoire est libre (pas d'obstacle proche)
     */
    isPathClear(startX, startY, endX, endY, margin = 50) {
        const dx = endX - startX;
        const dy = endY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        const rayDistance = this.raycast(startX, startY, angle);
        
        // Le chemin est libre si la distance libre est supérieure à la distance nécessaire + marge
        return rayDistance >= distance + margin;
    }

    /**
     * Obtient les informations sur les obstacles proches
     */
    getNearbyObstacles(botX, botY, radius = 200) {
        if (!this.room || !this.room.obstacles) return [];
        
        const nearby = [];
        
        for (const obs of this.room.obstacles) {
            // Centre de l'obstacle
            const obsCenterX = obs.x + obs.w / 2;
            const obsCenterY = obs.y + obs.h / 2;
            
            const dx = obsCenterX - botX;
            const dy = obsCenterY - botY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < radius) {
                nearby.push({
                    x: obs.x,
                    y: obs.y,
                    w: obs.w,
                    h: obs.h,
                    centerX: obsCenterX,
                    centerY: obsCenterY,
                    distance: distance,
                    angle: Math.atan2(dy, dx)
                });
            }
        }
        
        return nearby.sort((a, b) => a.distance - b.distance);
    }

    /**
     * Obtient un résumé de la vision pour l'apprentissage
     */
    getVisionSummary(botX, botY) {
        const vision = this.getVision(botX, botY);
        const nearbyObstacles = this.getNearbyObstacles(botX, botY, 300);
        
        // Directions principales (gauche, droite, haut, bas)
        const directions = {
            left: vision[Math.floor(this.rayCount * 0.25)].distance,
            right: vision[Math.floor(this.rayCount * 0.75)].distance,
            up: vision[Math.floor(this.rayCount * 0.5)].distance,
            down: vision[0].distance
        };
        
        // Distance moyenne libre
        const avgDistance = vision.reduce((sum, v) => sum + v.distance, 0) / vision.length;
        
        // Nombre d'obstacles proches
        const obstacleCount = nearbyObstacles.length;
        
        return {
            directions,
            avgDistance,
            obstacleCount,
            hasClearPath: avgDistance > 200
        };
    }
}

module.exports = BotVision;

