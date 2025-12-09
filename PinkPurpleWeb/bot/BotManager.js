/**
 * Bot Manager - Gère l'activation/désactivation des bots dans les rooms
 */

const BotAI = require('./BotAI');

class BotManager {
    constructor(PlayerClass, GrenadeClass, ioInstance) {
        this.PlayerClass = PlayerClass;
        this.GrenadeClass = GrenadeClass;
        this.io = ioInstance;
        this.activeBots = new Map(); // Map<roomId, BotAI>
    }

    /**
     * Vérifie si un bot doit être activé/désactivé dans une room
     */
    checkRoom(room) {
        const hasP1 = !!room.players['p1'];
        const hasP2 = !!room.players['p2'];
        const botAI = this.activeBots.get(room.id);

        // Si un seul joueur et pas de bot -> activer bot
        if ((hasP1 && !hasP2) || (!hasP1 && hasP2)) {
            if (!botAI) {
                this.activateBot(room);
            }
        }
        // Si deux joueurs (vrais) -> désactiver bot
        else if (hasP1 && hasP2) {
            // Vérifier si l'un des joueurs est un bot
            const p1IsBot = room.players['p1'] && room.players['p1'].isBot;
            const p2IsBot = room.players['p2'] && room.players['p2'].isBot;
            
            // Si les deux sont de vrais joueurs, désactiver le bot
            if (!p1IsBot && !p2IsBot && botAI) {
                this.deactivateBot(room.id);
            }
        }
        // Si aucun joueur -> désactiver bot
        else if (!hasP1 && !hasP2) {
            if (botAI) {
                this.deactivateBot(room.id);
            }
        }
    }

    /**
     * Active un bot dans une room
     */
    activateBot(room) {
        const hasP1 = !!room.players['p1'];
        const hasP2 = !!room.players['p2'];

        // Déterminer quel slot est libre
        let botSlot = null;
        if (!hasP1) {
            botSlot = 'p1';
        } else if (!hasP2) {
            botSlot = 'p2';
        }

        if (!botSlot) return; // Pas de slot libre

        // Créer le bot (utiliser la classe Player normale avec un ID spécial)
        if (!this.PlayerClass) {
            console.error('[BotManager] Player class not found');
            return;
        }
        
        const botPlayer = new this.PlayerClass('BOT_' + room.id, botSlot === 'p1', 'Bot');
        botPlayer.isBot = true;
        
        // Ajouter le bot à la room
        room.players[botSlot] = botPlayer;

        // Créer et démarrer l'IA (Pure Heuristique)
        const botAI = new BotAI(botPlayer, room, this.GrenadeClass);
        botAI.start();
        this.activeBots.set(room.id, botAI);

        console.log(`[BotManager] Bot activé dans room ${room.id} comme ${botSlot}`);

        // Notifier les clients du changement de noms
        if (this.io) {
            this.io.to(room.id).emit('update_names', room.getPlayerNames());
        }
    }

    /**
     * Désactive le bot d'une room
     */
    deactivateBot(roomId) {
        const botAI = this.activeBots.get(roomId);
        if (botAI) {
            botAI.stop();
            this.activeBots.delete(roomId);
            console.log(`[BotManager] Bot désactivé dans room ${roomId}`);
        }
    }

    /**
     * Nettoie tous les bots (appelé à l'arrêt)
     */
    cleanup() {
        for (const [roomId, botAI] of this.activeBots) {
            botAI.stop();
        }
        this.activeBots.clear();
    }
}

module.exports = BotManager;

