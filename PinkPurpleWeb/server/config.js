// Configuration de génération de carte
// Options: 'random', 'symmetric', 'fixed_symmetric'

module.exports = {
    MAP_GENERATION_MODE: process.env.MAP_MODE || 'fixed_symmetric', // Par défaut: fixe symétrique pour le bot
};

