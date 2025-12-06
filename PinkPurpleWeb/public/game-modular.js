/**
 * PinkPurple Game - Main Entry Point
 * Orchestrates all game modules
 */

import { NetworkManager } from './modules/network.js';
import { soundManager, audioCtx } from './modules/audio.js';
import { InputManager } from './modules/input.js';
import { Renderer } from './modules/rendering.js';
import { UIManager } from './modules/ui.js';

// Initialize Socket.IO
const socket = io();

// Initialize managers
const network = new NetworkManager(socket);
const ui = new UIManager();
const canvas = document.getElementById('game-canvas');
const renderer = new Renderer(canvas, network);
const input = new InputManager(network, soundManager);

// === WELCOME SCREEN / LOBBY LOGIC ===
const welcomeScreen = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-ui');
const playerNameInput = document.getElementById('player-name-input');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code-input');

// Load saved name
const savedName = localStorage.getItem('pinkpurple_player_name');
if (savedName) {
    playerNameInput.value = savedName;
} else {
    // Generate random simple name: Player + Number
    const randomName = `Player${Math.floor(Math.random() * 1000)}`;
    playerNameInput.value = randomName;
}

// Start music on interaction
let musicStarted = false;
function startMusic() {
    if (!musicStarted) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        soundManager.startBgMusic();
        musicStarted = true;
    }
}

playerNameInput.addEventListener('focus', startMusic);
playerNameInput.addEventListener('click', startMusic);
roomCodeInput.addEventListener('focus', startMusic);

// Validate name and prepare game
function prepareGame() {
    const playerName = playerNameInput.value.trim();
    if (!playerName) {
        playerNameInput.focus();
        // Shake animation
        playerNameInput.style.animation = 'shake 0.5s';
        setTimeout(() => playerNameInput.style.animation = '', 500);
        return null;
    }

    localStorage.setItem('pinkpurple_player_name', playerName);
    startMusic();
    return playerName;
}

// Create Room
createBtn.addEventListener('click', () => {
    const name = prepareGame();
    if (name) {
        socket.emit('create_room', name);
    }
});

// Join Room
joinBtn.addEventListener('click', () => {
    const name = prepareGame();
    if (name) {
        const code = roomCodeInput.value.trim();
        if (code) {
            // Send object with roomId and playerName
            socket.emit('join_room', { roomId: code, playerName: name });
        } else {
            ui.setLobbyStatus("ENTER A CODE");
        }
    }
});

// Add shake animation style
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
        20%, 40%, 60%, 80% { transform: translateX(10px); }
    }
`;
document.head.appendChild(style);

// Setup network event handlers
network.on('joined_room', (data) => {
    // Switch to game view
    // welcomeScreen.style.display = 'none'; // Handled by ui.showGame()
    ui.showGame();
    ui.setRoomCode(data.roomId);
    ui.setPlayerStatus(data.role);
    ui.showControlsHint();

    // Resume audio
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // Music is already playing from lobby

    // Start rendering
    renderer.start();
});

network.on('error', (msg) => {
    ui.setLobbyStatus(msg);
});

network.on('map_update', (obstacles) => {
    renderer.setObstacles(obstacles);
});

network.on('game_event', (event) => {
    const { players } = network.getState();

    switch (event.type) {
        case 'hit':
            if (players[event.to]) {
                renderer.createExplosion(players[event.to].x, players[event.to].y, players[event.from].color);
                renderer.addFloatingDamage(players[event.to].x, players[event.to].y, event.damage || 10, '#ff0000');

                renderer.triggerHitEffect(event.from, event.to, event.damage);

                ui.flashScreen();
                soundManager.playHit();
            }
            break;

        case 'swing':
            if (players[event.player]) {
                renderer.triggerSwing(event.player);
                // soundManager.playNoise(0.1, 1.0); // Gentle whoosh
            }
            break;

        case 'death':
            renderer.addShake(30);
            soundManager.playNoise(0.5, 0.4);
            ui.showControlsHint();
            if (event.player && players[event.player]) {
                renderer.addFloatingText(players[event.player].x, players[event.player].y, 'K.O.!', '#ff0000');
            }
            break;

        case 'bounce':
            soundManager.playBounce();
            // Trigger visual squash
            if (players[event.player]) {
                renderer.triggerBounce(event.player);
            }
            break;

        case 'grenade_explode':
            renderer.addShake(40);
            soundManager.playNoise(0.6, 0.5);
            soundManager.playTone(60, 'sine', 0.4, 0.2);
            renderer.addFloatingText(event.x, event.y, 'BOOM!', '#ffff00');
            break;

        case 'grenade_hit':
            soundManager.playHit();
            if (event.target && players[event.target]) {
                renderer.addFloatingDamage(players[event.target].x, players[event.target].y, event.damage || 10, '#ff8800');
            }
            break;
    }
});

network.on('game_over', (data) => {
    soundManager.playWin();
    ui.showGameOver(data.winner);
});

// Setup input handlers
input.setupKeyboard();
input.setupTouchControls();

// Setup socket listeners
network.setupSocketListeners();

// Show initial controls hint
ui.showControlsHint();

console.log('🎮 PinkPurple Game initialized!');
