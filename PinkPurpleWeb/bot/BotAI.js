/**
 * Bot AI - Logique de décision Réactive (Heuristique)
 * Optimisé pour la performance et l'adaptabilité aux cartes changeantes.
 */

const BotVision = require('./BotVision');

// Constantes de physique
const GRAVITY = 8;
const PLAYER_RADIUS = 25;
const WIDTH = 1920;
const HEIGHT = 1080;

// Configuration Heuristique
const WEIGHTS = {
    WALL_AVOIDANCE: 2.0,
    ENEMY_ALIGNMENT: 1.5,
    HEIGHT_ADVANTAGE: 1.2,
    CENTER_BIAS: 0.5
};

class BotAI {
    constructor(botPlayer, gameRoom, GrenadeClass) {
        this.bot = botPlayer;
        this.room = gameRoom;
        this.GrenadeClass = GrenadeClass;
        this.vision = new BotVision(gameRoom);
        this.lastDecisionTime = 0;
        this.decisionInterval = null;
        this.victoryStanceStartTime = null;
        
        // État interne pour "lisser" les mouvements
        this.currentIntent = null;
        this.intentTimer = 0;
    }

    start() {
        // Fréquence de rafraîchissement rapide (réactivité)
        if (this.decisionInterval) return;
        this.decisionInterval = setInterval(() => this.update(), 100); // 10Hz
    }

    stop() {
        if (this.decisionInterval) {
            clearInterval(this.decisionInterval);
            this.decisionInterval = null;
        }
    }

    update() {
        const now = Date.now();
        const me = this.bot;
        
        // 1. Gestion Victory Stance (Priorité Absolue)
        if (me.victoryStance) {
            if (this.victoryStanceStartTime === null) this.victoryStanceStartTime = now;
            if (now - this.victoryStanceStartTime < 1000) return; // Freeze
            me.victoryStance = false;
            this.victoryStanceStartTime = null;
        }

        // 2. Acquisition Cible
        const p1 = this.room.players['p1'];
        const p2 = this.room.players['p2'];
        if (!p1 || !p2) return;
        const enemy = me.isPlayer1 ? p2 : p1;

        // 3. Vision & Analyse
        const vision = this.vision.getVisionSummary(me.x, me.y);
        const dx = enemy.x - me.x;
        const dy = enemy.y - me.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // 4. Arbre de Décision Heuristique (Priorités)
        let action = null;

        // --- A. SURVIE (Danger Immédiat) ---
        // Mur très proche -> Fuite opposée
        // Sécurité HAUTE : Si on est trop haut (y < 200), interdire UP et forcer DOWN
        if (me.y < 250) {
            action = 'DOWN';
        } 
        else if (vision.directions.left < 50) action = 'RIGHT';
        else if (vision.directions.right < 50) action = 'LEFT';
        else if (vision.directions.up < 50 && me.y > 300) action = 'DOWN'; // Marge augmentée
        else if (vision.directions.down < 50 && me.y < HEIGHT - 200) action = 'UP';

        // --- B. ATTAQUE ( Opportunité) ---
        // Distance d'attaque augmentée pour être plus agressif
        if (!action && dist < 140 && me.moveCooldown === 0) {
            // Si aligné horizontalement ou verticalement
            if (Math.abs(dy) < 60) action = 'HIT'; // Coup standard plus tolérant
            else if (dy > 0 && Math.abs(dx) < 100) action = 'SLAM'; // Au dessus -> Slam
        }

        // --- C. TRAQUE (Aggressive) ---
        if (!action && me.moveCooldown === 0) {
            // Si l'ennemi est loin, FONCER sur lui
            // On ignore partiellement les obstacles mineurs pour maintenir la pression
            
            // Calcul de la direction optimale
            const targetX = enemy.x;
            const targetY = enemy.y;
            
            if (Math.abs(me.x - targetX) > 100) {
                action = (me.x < targetX) ? 'RIGHT' : 'LEFT';
                
                // Vérifier si cette direction est bloquée (mur très proche)
                if (action === 'RIGHT' && vision.directions.right < 50) action = 'UP'; // Sauter l'obstacle
                if (action === 'LEFT' && vision.directions.left < 50) action = 'UP';
            }
            // Si aligné horizontalement mais pas verticalement
            else if (Math.abs(me.y - targetY) > 100) {
                if (me.y > targetY) action = 'UP'; // Monter vers l'ennemi
                else action = 'DOWN'; // Descendre sur lui
            }
        }

        // --- D. DASH / GRENADE (Outplay) ---
        if (!action) {
            // Dash AGRESSIF pour closer l'écart
            if (dist > 250 && dist < 500 && me.dashCooldown === 0) {
                // Si on regarde vers l'ennemi
                const facingEnemy = (enemy.x > me.x && me.lastFacing === 1) || (enemy.x < me.x && me.lastFacing === -1);
                if (facingEnemy) action = 'DASH';
            }
            // Grenade si ennemi loin et aligné
            else if (dist > 400 && dist < 700 && me.grenadeCount > 0 && Math.random() < 0.1) {
                action = 'GRENADE';
            }
        }

        // 5. Exécution
        if (action) {
            this.executeAction(action);
        }
    }

    executeAction(action) {
        if (!this.bot || !this.room) return;
        const result = this.bot.applyInput(action);
        if (result && result.type === 'grenade' && this.GrenadeClass) {
            const grenade = new this.GrenadeClass(result.x, result.y, result.vx, result.vy, this.bot.id);
            this.room.grenades.push(grenade);
        }
    }

    // Callbacks events (pour effets futurs, plus d'apprentissage)
    onGameEvent(event) {}
    onGameEnd() {}
}

module.exports = BotAI;
