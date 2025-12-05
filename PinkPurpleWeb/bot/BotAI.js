/**
 * Bot AI - Logique de décision pour le bot avec apprentissage
 */

const BotLearning = require('./BotLearning');
const BotVision = require('./BotVision');

// Constantes de physique (doivent correspondre à server.js)
const GRAVITY = 8;
const T_INC = 0.3;
const PLAYER_RADIUS = 25;
const WIDTH = 1920;
const HEIGHT = 1080;

class BotAI {
    constructor(botPlayer, gameRoom, GrenadeClass, learningSystem = null) {
        this.bot = botPlayer;
        this.room = gameRoom;
        this.GrenadeClass = GrenadeClass;
        this.learning = learningSystem || new BotLearning(); // Système d'apprentissage partagé
        this.vision = new BotVision(gameRoom); // Système de vision par ray casting
        this.lastDecisionTime = 0;
        this.decisionInterval = null;
        this.lastState = null; // État précédent pour calculer les récompenses
        this.gameStartScore = null; // Score au début de la partie
    }

    start() {
        // Prendre des décisions toutes les ~200ms (5 fois par seconde) pour éviter le spam
        if (this.decisionInterval) return; // Déjà démarré

        this.decisionInterval = setInterval(() => {
            this.makeDecision();
        }, 200);
    }

    stop() {
        if (this.decisionInterval) {
            clearInterval(this.decisionInterval);
            this.decisionInterval = null;
        }
    }

    makeDecision() {
        const now = Date.now();
        if (now - this.lastDecisionTime < 200) return; // Cooldown minimum entre décisions

        const p1 = this.room.players['p1'];
        const p2 = this.room.players['p2'];

        if (!p1 || !p2) return;

        const me = this.bot;
        const enemy = me.isPlayer1 ? p2 : p1;

        if (!me || !enemy) return;

        // Initialiser le score de départ
        if (this.gameStartScore === null) {
            this.gameStartScore = { ...this.room.scores };
        }

        // Le système de cooldown dans applyInput() gère déjà les mouvements
        // On peut quand même décider, applyInput() retournera si cooldown actif
        const dx = enemy.x - me.x;
        const dy = enemy.y - me.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // Obtenir la vision du bot (ray casting)
        const vision = this.vision.getVisionSummary(me.x, me.y);

        // Obtenir l'état actuel (avec informations de vision)
        const stateKey = this.learning.getStateKey(me, enemy, distance, dx, dy, vision);

        // Obtenir les actions disponibles (en utilisant la vision pour éviter les obstacles)
        const availableActions = this.getAvailableActions(me, enemy, distance, dx, dy, vision);

        // Choisir une action (avec apprentissage)
        const action = this.learning.chooseAction(stateKey, availableActions) ||
            this.decideAction(me, enemy, distance, angle, dx, dy, vision);

        if (action) {
            // Enregistrer l'état avant l'action
            this.lastState = {
                stateKey,
                action,
                distance,
                me: { x: me.x, y: me.y },
                enemy: { x: enemy.x, y: enemy.y }
            };

            this.executeAction(action);
            this.lastDecisionTime = now;
        }
    }

    /**
     * Vérifie si un mouvement va causer une collision avec un obstacle
     */
    wouldCollideWithObstacle(startX, startY, velocity, angle, maxTime = 2.0) {
        if (!this.room || !this.room.obstacles) return false;

        // Simuler la trajectoire
        let t = 0;
        const timeStep = 0.1;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;

        while (t < maxTime) {
            t += timeStep;
            const x = startX + vx * t;
            const y = startY + vy * t + 0.5 * GRAVITY * t * t;

            // Vérifier les limites de l'écran
            if (x < PLAYER_RADIUS || x > WIDTH - PLAYER_RADIUS || y < PLAYER_RADIUS) {
                return true; // Collision avec les bords
            }

            // Vérifier collision avec obstacles
            for (const obs of this.room.obstacles) {
                if (x + PLAYER_RADIUS > obs.x && x - PLAYER_RADIUS < obs.x + obs.w &&
                    y + PLAYER_RADIUS > obs.y && y - PLAYER_RADIUS < obs.y + obs.h) {
                    return true; // Collision avec obstacle
                }
            }
        }

        return false;
    }

    /**
     * Calcule la portée réelle du dash (distance parcourue avant collision ou arrêt)
     * @param {number} startX - Position X de départ
     * @param {number} startY - Position Y de départ
     * @param {number} currentAngle - Angle actuel du joueur (le dash garde cet angle)
     */
    calculateDashRange(startX, startY, currentAngle) {
        // Dash : velocity = -120, garde l'angle actuel (ou 0 si vertical)
        const velocity = -120;
        // Si l'angle est presque vertical, le dash devient horizontal (comme dans server.js)
        let dashAngle = currentAngle;
        if (Math.abs(currentAngle - Math.PI / 2) < 0.1) {
            dashAngle = 0; // Horizontal vers la droite
        }

        let t = 0;
        const timeStep = 0.1;
        const vx = Math.cos(dashAngle) * velocity;
        const vy = Math.sin(dashAngle) * velocity;
        let lastX = startX;
        let lastY = startY;

        while (t < 2.0) { // Max 2 secondes de simulation
            t += timeStep;
            const x = startX + vx * t;
            const y = startY + vy * t + 0.5 * GRAVITY * t * t;

            // Vérifier les limites
            if (x < PLAYER_RADIUS || x > WIDTH - PLAYER_RADIUS || y < PLAYER_RADIUS) {
                break;
            }

            // Vérifier collision avec obstacles
            let collided = false;
            for (const obs of this.room.obstacles) {
                if (x + PLAYER_RADIUS > obs.x && x - PLAYER_RADIUS < obs.x + obs.w &&
                    y + PLAYER_RADIUS > obs.y && y - PLAYER_RADIUS < obs.y + obs.h) {
                    collided = true;
                    break;
                }
            }

            if (collided) break;

            lastX = x;
            lastY = y;
        }

        // Calculer la distance parcourue
        const dx = lastX - startX;
        const dy = lastY - startY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Obtient les actions disponibles selon la situation (avec vérification des obstacles)
     */
    getAvailableActions(me, enemy, distance, dx, dy, vision = null) {
        const actions = [];
        const ATTACK_RANGE = 100;
        const GRENADE_RANGE = 300;
        const DASH_RANGE = 200;

        // Actions de mouvement (vérifier les collisions et utiliser la vision)
        if (me.moveCooldown === 0) {
            // Utiliser la vision pour déterminer les directions libres
            const useVision = vision && vision.directions;

            // LEFT
            if (dx < 0) {
                const leftAngle = Math.PI / 3; // 60° up-left
                const isClear = useVision ? vision.directions.left > 100 :
                    !this.wouldCollideWithObstacle(me.x, me.y, -50, leftAngle);
                if (isClear) {
                    actions.push('LEFT');
                }
            }

            // RIGHT
            if (dx > 0) {
                const rightAngle = 2 * Math.PI / 3; // 120° up-right
                const isClear = useVision ? vision.directions.right > 100 :
                    !this.wouldCollideWithObstacle(me.x, me.y, -50, rightAngle);
                if (isClear) {
                    actions.push('RIGHT');
                }
            }

            // UP
            if (dy < 0 && me.y > 150) { // Don't go too high (ceiling limit)
                const upAngle = Math.PI / 2; // 90° straight up
                const isClear = useVision ? vision.directions.up > 100 :
                    !this.wouldCollideWithObstacle(me.x, me.y, -50, upAngle);
                if (isClear) {
                    actions.push('UP');
                }
            }

            // SLAM
            // More aggressive: if above and roughly aligned horizontally
            if (me.y < enemy.y - 100 && Math.abs(dx) < 200) {
                actions.push('SLAM');
            }
        }

        // Dash (vérifier la portée réelle avec l'angle actuel)
        if (me.dashCooldown === 0 && distance > ATTACK_RANGE) {
            // Le dash garde l'angle actuel (ou devient horizontal si vertical)
            let dashAngle = me.angle;
            if (Math.abs(me.angle - Math.PI / 2) < 0.1) {
                dashAngle = 0; // Horizontal vers la droite
            }

            const dashRange = this.calculateDashRange(me.x, me.y, me.angle);

            // Utiliser le dash seulement si la portée est suffisante et si on peut se rapprocher
            // Vérifier que le dash nous rapproche de l'adversaire
            const dashVx = Math.cos(dashAngle) * -120;
            const dashVy = Math.sin(dashAngle) * -120;
            const dashEndX = me.x + dashVx * 0.5; // Position approximative après dash
            const dashEndY = me.y + dashVy * 0.5;
            const newDx = enemy.x - dashEndX;
            const newDy = enemy.y - dashEndY;
            const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);

            if (dashRange > 50 && dashRange < DASH_RANGE * 1.5 && newDistance < distance) {
                // Vérifier aussi qu'on ne va pas dans un obstacle
                if (!this.wouldCollideWithObstacle(me.x, me.y, -120, dashAngle, 0.5)) {
                    actions.push('DASH');
                }
            }
        }

        // Grenade
        if (me.grenadeCount > 0 && distance > ATTACK_RANGE && distance < GRENADE_RANGE) {
            actions.push('GRENADE');
        }

        // Attaque
        if (distance < ATTACK_RANGE) {
            actions.push('HIT');
        }

        return actions.length > 0 ? actions : ['LEFT', 'RIGHT', 'UP']; // Fallback
    }

    decideAction(me, enemy, distance, angle, dx, dy, vision = null) {
        const ATTACK_RANGE = 100;
        const GRENADE_RANGE = 300;
        const DASH_RANGE = 200;

        // 1. SLAM LOGIC IMPROVED
        // If we are significantly above the enemy and roughly aligned horizontally
        if (me.y < enemy.y - 100 && Math.abs(dx) < 200 && me.moveCooldown === 0) {
            // Probability increases as we get closer horizontally
            const alignmentFactor = 1 - (Math.abs(dx) / 200); // 1.0 if aligned, 0.0 if at edge
            if (Math.random() < alignmentFactor * 0.8) { // Max 80% chance
                return 'SLAM';
            }
        }

        // 2. Si à distance moyenne -> DASH vers l'adversaire (avec vérification de portée)
        if (distance > ATTACK_RANGE && me.dashCooldown === 0) {
            // Le dash garde l'angle actuel (ou devient horizontal si vertical)
            let dashAngle = me.angle;
            if (Math.abs(me.angle - Math.PI / 2) < 0.1) {
                dashAngle = 0; // Horizontal vers la droite
            }

            const dashRange = this.calculateDashRange(me.x, me.y, me.angle);

            // Vérifier que le dash nous rapproche de l'adversaire
            const dashVx = Math.cos(dashAngle) * -120;
            const dashVy = Math.sin(dashAngle) * -120;
            const dashEndX = me.x + dashVx * 0.5;
            const dashEndY = me.y + dashVy * 0.5;
            const newDx = enemy.x - dashEndX;
            const newDy = enemy.y - dashEndY;
            const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);

            // Utiliser le dash si la portée est bonne et qu'on peut se rapprocher
            if (dashRange > 50 && dashRange < DASH_RANGE * 1.5 && newDistance < distance) {
                if (!this.wouldCollideWithObstacle(me.x, me.y, -120, dashAngle, 0.5)) {
                    if (Math.random() > 0.4) {
                        return 'DASH';
                    }
                }
            }
        }

        // 3. Si à distance de grenade et on en a -> GRENADE
        if (distance > ATTACK_RANGE && distance < GRENADE_RANGE && me.grenadeCount > 0) {
            if (Math.random() > 0.8) {
                return 'GRENADE';
            }
        }

        // 4. Se rapprocher de l'adversaire (en utilisant la vision pour éviter les obstacles)
        if (distance > ATTACK_RANGE && me.moveCooldown === 0) {
            // 40% de chance d'attendre au lieu de spammer
            if (Math.random() < 0.4) {
                return null; // Attendre
            }

            // Utiliser la vision pour trouver le meilleur chemin
            const targetAngle = Math.atan2(dy, dx);
            const bestAngle = this.vision.getBestDirection(me.x, me.y, targetAngle);

            // Convertir l'angle en action
            const angleDiff = Math.abs(bestAngle - targetAngle);
            if (angleDiff < Math.PI / 6) { // Proche de la direction cible
                if (Math.abs(dx) > Math.abs(dy)) {
                    // Mouvement horizontal
                    if (dx > 0) {
                        if (this.vision.isPathClear(me.x, me.y, me.x + 100, me.y, 50)) {
                            return 'RIGHT';
                        }
                    } else {
                        if (this.vision.isPathClear(me.x, me.y, me.x - 100, me.y, 50)) {
                            return 'LEFT';
                        }
                    }
                } else {
                    // Mouvement vertical
                    if (dy < 0) {
                        if (this.vision.isPathClear(me.x, me.y, me.x, me.y - 100, 50)) {
                            return 'UP';
                        }
                    } else {
                        // En dessous de l'adversaire
                        if (me.y > HEIGHT - 200) {
                            return Math.random() > 0.7 ? 'SLAM' : null;
                        }
                    }
                }
            } else {
                // Suivre la direction libre la plus proche
                if (bestAngle < Math.PI / 4 || bestAngle > 7 * Math.PI / 4) {
                    return 'RIGHT';
                } else if (bestAngle > 3 * Math.PI / 4 && bestAngle < 5 * Math.PI / 4) {
                    return 'LEFT';
                } else if (bestAngle > Math.PI / 4 && bestAngle < 3 * Math.PI / 4) {
                    return 'UP';
                }
            }
        }

        // 5. Si très proche -> ATTAQUER
        if (distance < ATTACK_RANGE) {
            if (Math.random() > 0.5) {
                return 'HIT';
            }
        }

        // 6. Mouvement aléatoire occasionnel (en évitant les obstacles)
        // Réduire la probabilité pour éviter le spam
        if (Math.random() > 0.95 && me.moveCooldown === 0) {
            const randomActions = [
                { action: 'LEFT', angle: Math.PI / 3 },
                { action: 'RIGHT', angle: 2 * Math.PI / 3 },
                { action: 'UP', angle: Math.PI / 2 }
            ];
            const randomAction = randomActions[Math.floor(Math.random() * randomActions.length)];
            if (!this.wouldCollideWithObstacle(me.x, me.y, -50, randomAction.angle)) {
                return randomAction.action;
            }
        }

        // Par défaut, attendre au lieu de spammer
        return null;
    }

    executeAction(action) {
        if (!this.bot || !this.room) return;

        const result = this.bot.applyInput(action);

        if (result && result.type === 'grenade' && this.GrenadeClass) {
            // Créer la grenade dans la room
            const grenade = new this.GrenadeClass(result.x, result.y, result.vx, result.vy, this.bot.id);
            this.room.grenades.push(grenade);
        }
    }

    /**
     * Appelé quand un événement de jeu se produit (pour l'apprentissage)
     */
    onGameEvent(event) {
        if (!this.learning || !this.lastState) return;

        const me = this.bot;
        const enemy = me.isPlayer1 ? this.room.players['p2'] : this.room.players['p1'];
        if (!enemy) return;

        // Calculer la récompense
        const dx = enemy.x - me.x;
        const dy = enemy.y - me.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const nextStateKey = this.learning.getStateKey(me, enemy, distance, dx, dy);

        const reward = this.learning.calculateReward(event, me, enemy, this.lastState);

        // Enregistrer l'expérience
        this.learning.recordExperience(
            this.lastState.stateKey,
            this.lastState.action,
            reward,
            nextStateKey
        );
    }

    /**
     * Appelé à la fin d'une partie
     */
    onGameEnd() {
        if (!this.learning) return;

        const myScore = this.bot.isPlayer1 ? this.room.scores.p1 : this.room.scores.p2;
        const enemyScore = this.bot.isPlayer1 ? this.room.scores.p2 : this.room.scores.p1;
        const startMyScore = this.bot.isPlayer1 ? this.gameStartScore.p1 : this.gameStartScore.p2;

        const won = myScore > startMyScore;
        this.learning.recordGameResult(won);

        // Afficher les stats
        const stats = this.learning.getStats();
        console.log(`[Bot] Partie terminée - ${won ? 'Victoire' : 'Défaite'} | Stats: ${stats.winRate}% win rate, ${stats.statesLearned} états appris`);

        this.gameStartScore = null;
        this.lastState = null;
    }
}

module.exports = BotAI;
