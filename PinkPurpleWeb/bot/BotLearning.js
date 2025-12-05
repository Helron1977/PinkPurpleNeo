/**
 * Bot Learning - Système d'apprentissage par renforcement (Q-Learning)
 * Le bot apprend de ses expériences pour améliorer ses décisions
 */

const fs = require('fs');
const path = require('path');

class BotLearning {
    constructor() {
        // Table Q: Map<state, Map<action, qValue>>
        this.qTable = new Map();
        
        // Paramètres d'apprentissage
        this.learningRate = 0.1; // Alpha - vitesse d'apprentissage
        this.discountFactor = 0.9; // Gamma - importance des récompenses futures
        this.explorationRate = 0.3; // Epsilon - probabilité d'exploration vs exploitation
        
        // Statistiques
        this.stats = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            totalReward: 0
        };
        
        // Historique récent pour calculer les récompenses
        this.recentStates = []; // [{state, action, reward}, ...]
        
        this.loadKnowledge();
    }

    /**
     * Convertit l'état du jeu en une clé d'état discrète
     * @param {Object} vision - Résumé de la vision du bot (optionnel)
     */
    getStateKey(me, enemy, distance, dx, dy, vision = null) {
        // Discretiser l'état pour réduire l'espace d'états
        const distBucket = Math.floor(distance / 50); // Buckets de 50px
        const dxBucket = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        const dyBucket = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        const heightDiff = Math.floor((me.y - enemy.y) / 50);
        const damageDiff = Math.floor((enemy.damage - me.damage) / 10);
        const canDash = me.dashCooldown === 0 ? 1 : 0;
        const canSlam = me.moveCooldown === 0 ? 1 : 0;
        const hasGrenade = me.grenadeCount > 0 ? 1 : 0;
        
        // Ajouter les informations de vision si disponibles
        let visionInfo = '';
        if (vision) {
            const hasClearPath = vision.hasClearPath ? 1 : 0;
            const obstacleNear = vision.obstacleCount > 0 ? 1 : 0;
            const leftClear = vision.directions.left > 100 ? 1 : 0;
            const rightClear = vision.directions.right > 100 ? 1 : 0;
            visionInfo = `_${hasClearPath}_${obstacleNear}_${leftClear}_${rightClear}`;
        }
        
        return `${distBucket}_${dxBucket}_${dyBucket}_${heightDiff}_${damageDiff}_${canDash}_${canSlam}_${hasGrenade}${visionInfo}`;
    }

    /**
     * Choisit une action en utilisant epsilon-greedy (exploration vs exploitation)
     */
    chooseAction(stateKey, availableActions) {
        if (availableActions.length === 0) return null;
        
        // Exploration: action aléatoire
        if (Math.random() < this.explorationRate) {
            return availableActions[Math.floor(Math.random() * availableActions.length)];
        }
        
        // Exploitation: meilleure action connue
        const stateQ = this.qTable.get(stateKey);
        if (!stateQ || stateQ.size === 0) {
            // État inconnu -> exploration
            return availableActions[Math.floor(Math.random() * availableActions.length)];
        }
        
        // Trouver l'action avec la meilleure Q-value
        let bestAction = null;
        let bestValue = -Infinity;
        
        for (const action of availableActions) {
            const qValue = stateQ.get(action) || 0;
            if (qValue > bestValue) {
                bestValue = qValue;
                bestAction = action;
            }
        }
        
        return bestAction || availableActions[0];
    }

    /**
     * Met à jour la Q-table avec une nouvelle expérience
     */
    updateQValue(stateKey, action, reward, nextStateKey = null) {
        if (!this.qTable.has(stateKey)) {
            this.qTable.set(stateKey, new Map());
        }
        
        const stateQ = this.qTable.get(stateKey);
        const currentQ = stateQ.get(action) || 0;
        
        // Q-Learning formula: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
        let nextMaxQ = 0;
        if (nextStateKey && this.qTable.has(nextStateKey)) {
            const nextStateQ = this.qTable.get(nextStateKey);
            for (const qValue of nextStateQ.values()) {
                nextMaxQ = Math.max(nextMaxQ, qValue);
            }
        }
        
        const newQ = currentQ + this.learningRate * (reward + this.discountFactor * nextMaxQ - currentQ);
        stateQ.set(action, newQ);
    }

    /**
     * Calcule la récompense pour une action
     */
    calculateReward(event, me, enemy, previousState) {
        let reward = 0;
        
        // Récompenses positives
        if (event.type === 'hit' && event.from === me.id) {
            reward += 10; // Hit réussi
        }
        if (event.type === 'grenade_hit' && event.target !== me.id) {
            reward += 15; // Grenade réussie
        }
        if (event.type === 'death' && event.player !== me.id) {
            reward += 50; // Élimination de l'adversaire
        }
        
        // Pénalités
        if (event.type === 'hit' && event.to === me.id) {
            reward -= 5; // Reçu un hit
        }
        if (event.type === 'grenade_hit' && event.target === me.id) {
            reward -= 10; // Touché par grenade
        }
        if (event.type === 'death' && event.player === me.id) {
            reward -= 50; // Mort
        }
        
        // Récompense pour se rapprocher de l'adversaire (si action de mouvement)
        if (previousState && previousState.action && ['LEFT', 'RIGHT', 'UP', 'DASH'].includes(previousState.action)) {
            const oldDist = previousState.distance;
            const newDist = Math.sqrt((enemy.x - me.x) ** 2 + (enemy.y - me.y) ** 2);
            if (newDist < oldDist) {
                reward += 1; // Se rapprocher est bon
            } else if (newDist > oldDist + 50) {
                reward -= 1; // S'éloigner trop est mauvais
            }
        }
        
        return reward;
    }

    /**
     * Enregistre une expérience (état, action, récompense)
     */
    recordExperience(stateKey, action, reward, nextStateKey = null) {
        this.recentStates.push({
            stateKey,
            action,
            reward,
            nextStateKey,
            timestamp: Date.now()
        });
        
        // Garder seulement les 100 dernières expériences
        if (this.recentStates.length > 100) {
            this.recentStates.shift();
        }
        
        // Mettre à jour la Q-table
        this.updateQValue(stateKey, action, reward, nextStateKey);
        this.stats.totalReward += reward;
    }

    /**
     * Récompense finale à la fin d'une partie
     */
    recordGameResult(won) {
        this.stats.gamesPlayed++;
        if (won) {
            this.stats.wins++;
            // Récompense finale pour toutes les actions de la partie
            const finalReward = 100;
            for (const exp of this.recentStates) {
                this.updateQValue(exp.stateKey, exp.action, finalReward, null);
            }
        } else {
            this.stats.losses++;
            // Pénalité finale
            const finalPenalty = -50;
            for (const exp of this.recentStates) {
                this.updateQValue(exp.stateKey, exp.action, finalPenalty, null);
            }
        }
        
        // Réduire l'exploration au fil du temps
        this.explorationRate = Math.max(0.1, this.explorationRate * 0.999);
        
        // Réinitialiser l'historique
        this.recentStates = [];
        
        // Sauvegarder périodiquement
        if (this.stats.gamesPlayed % 10 === 0) {
            this.saveKnowledge();
        }
    }

    /**
     * Sauvegarde les connaissances apprises
     */
    saveKnowledge() {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            // Convertir Map en objet pour JSON
            const qTableObj = {};
            for (const [state, actions] of this.qTable) {
                qTableObj[state] = Object.fromEntries(actions);
            }
            
            const knowledge = {
                qTable: qTableObj,
                stats: this.stats,
                explorationRate: this.explorationRate,
                timestamp: Date.now()
            };
            
            fs.writeFileSync(
                path.join(dataDir, 'bot_knowledge.json'),
                JSON.stringify(knowledge, null, 2)
            );
            
            console.log(`[BotLearning] Connaissances sauvegardées (${this.qTable.size} états)`);
        } catch (error) {
            console.error('[BotLearning] Erreur sauvegarde:', error);
        }
    }

    /**
     * Charge les connaissances précédentes
     */
    loadKnowledge() {
        try {
            const knowledgePath = path.join(__dirname, '..', 'data', 'bot_knowledge.json');
            if (fs.existsSync(knowledgePath)) {
                const data = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
                
                // Reconvertir objet en Map
                this.qTable = new Map();
                for (const [state, actions] of Object.entries(data.qTable || {})) {
                    this.qTable.set(state, new Map(Object.entries(actions)));
                }
                
                this.stats = data.stats || this.stats;
                this.explorationRate = data.explorationRate || this.explorationRate;
                
                console.log(`[BotLearning] Connaissances chargées (${this.qTable.size} états, ${this.stats.gamesPlayed} parties)`);
            }
        } catch (error) {
            console.error('[BotLearning] Erreur chargement:', error);
        }
    }

    /**
     * Obtient les statistiques d'apprentissage
     */
    getStats() {
        return {
            ...this.stats,
            winRate: this.stats.gamesPlayed > 0 ? (this.stats.wins / this.stats.gamesPlayed * 100).toFixed(1) : 0,
            explorationRate: (this.explorationRate * 100).toFixed(1),
            statesLearned: this.qTable.size,
            avgReward: this.stats.gamesPlayed > 0 ? (this.stats.totalReward / this.stats.gamesPlayed).toFixed(2) : 0
        };
    }
}

module.exports = BotLearning;

