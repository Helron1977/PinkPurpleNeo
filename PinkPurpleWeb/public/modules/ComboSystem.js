/**
 * ComboSystem Module
 * Système de combo original : plus vous frappez rapidement, plus les effets sont spectaculaires !
 */

export class ComboSystem {
    constructor() {
        this.combos = new Map(); // playerId -> { count, lastHitTime, streak }
        this.comboDecayTime = 3000; // 3 secondes pour maintenir le combo
    }

    /**
     * Enregistre un hit et retourne le niveau de combo
     */
    recordHit(playerId) {
        const now = Date.now();
        const combo = this.combos.get(playerId) || { count: 0, lastHitTime: 0, streak: 0 };
        
        // Si le dernier hit est trop ancien, reset
        if (now - combo.lastHitTime > this.comboDecayTime) {
            combo.count = 0;
            combo.streak = 0;
        }
        
        // Incrémenter le combo
        combo.count++;
        combo.streak++;
        combo.lastHitTime = now;
        
        this.combos.set(playerId, combo);
        
        return {
            count: combo.count,
            streak: combo.streak,
            level: this.getComboLevel(combo.count)
        };
    }

    /**
     * Retourne le niveau de combo (1-5)
     */
    getComboLevel(count) {
        if (count >= 5) return 5; // MEGA COMBO
        if (count >= 4) return 4; // ULTRA COMBO
        if (count >= 3) return 3; // SUPER COMBO
        if (count >= 2) return 2; // COMBO
        return 1; // Single hit
    }

    /**
     * Retourne le nom du combo selon le niveau
     */
    getComboName(level) {
        const names = {
            1: '',
            2: 'COMBO!',
            3: 'SUPER!',
            4: 'ULTRA!',
            5: 'MEGA!'
        };
        return names[level] || '';
    }

    /**
     * Retourne la couleur du combo selon le niveau
     */
    getComboColor(level) {
        const colors = {
            1: '#fff',
            2: '#0ff', // Cyan
            3: '#ff0', // Yellow
            4: '#f0f', // Magenta
            5: '#f00'  // Red
        };
        return colors[level] || '#fff';
    }

    /**
     * Met à jour les combos (décroissance)
     */
    update() {
        const now = Date.now();
        for (const [playerId, combo] of this.combos.entries()) {
            if (now - combo.lastHitTime > this.comboDecayTime) {
                // Reset le combo après le délai
                this.combos.delete(playerId);
            }
        }
    }

    /**
     * Retourne le combo actuel d'un joueur
     */
    getCombo(playerId) {
        const combo = this.combos.get(playerId);
        if (!combo) return null;
        
        const now = Date.now();
        if (now - combo.lastHitTime > this.comboDecayTime) {
            this.combos.delete(playerId);
            return null;
        }
        
        return {
            count: combo.count,
            streak: combo.streak,
            level: this.getComboLevel(combo.count),
            name: this.getComboName(this.getComboLevel(combo.count)),
            color: this.getComboColor(this.getComboLevel(combo.count))
        };
    }
}

