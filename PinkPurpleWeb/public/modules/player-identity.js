/**
 * Player Identity Module
 * Handles player names and identity management
 */

export class PlayerIdentity {
    constructor() {
        this.playerName = this.loadPlayerName();
        this.setupNameInput();
    }

    // Load player name from localStorage
    loadPlayerName() {
        return localStorage.getItem('pinkpurple_player_name') || this.generateRandomName();
    }

    // Save player name to localStorage
    savePlayerName(name) {
        this.playerName = name;
        localStorage.setItem('pinkpurple_player_name', name);
    }

    // Generate random cool name
    generateRandomName() {
        const adjectives = [
            'Neon', 'Cyber', 'Pixel', 'Retro', 'Glitch',
            'Turbo', 'Hyper', 'Ultra', 'Mega', 'Super'
        ];
        const nouns = [
            'Warrior', 'Knight', 'Ninja', 'Samurai', 'Hunter',
            'Racer', 'Pilot', 'Hero', 'Legend', 'Master'
        ];

        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 100);

        return `${adj}${noun}${num}`;
    }

    // Setup name input in lobby
    setupNameInput() {
        const nameInput = document.getElementById('player-name');
        if (!nameInput) return;

        nameInput.value = this.playerName;

        nameInput.addEventListener('input', (e) => {
            const name = e.target.value.trim().substring(0, 12);
            if (name) {
                this.savePlayerName(name);
            }
        });

        nameInput.addEventListener('blur', (e) => {
            if (!e.target.value.trim()) {
                const randomName = this.generateRandomName();
                e.target.value = randomName;
                this.savePlayerName(randomName);
            }
        });
    }

    getName() {
        return this.playerName;
    }
}
