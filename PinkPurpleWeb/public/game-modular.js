import { NetworkManager } from './modules/network.js';
import { Renderer } from './modules/rendering.js';
import { InputManager } from './modules/input.js';
import { TutorialManager } from './modules/ui/TutorialManager.js';
import { SettingsManager } from './modules/ui/SettingsManager.js';

window.addEventListener('load', () => {
    const canvas = document.getElementById('game-canvas');
    const lobbyContainer = document.getElementById('lobby-container');
    const gameUI = document.getElementById('game-ui');
    const createBtn = document.getElementById('create-btn');
    const joinBtn = document.getElementById('join-btn');
    const roomCodeInput = document.getElementById('room-code-input');
    const nameInput = document.getElementById('player-name-input');
    const lobbyStatus = document.getElementById('lobby-status');
    const roomDisplay = document.getElementById('room-display');
    const shareBtn = document.getElementById('share-btn');

    // --- MANAGER INITIALIZATION ---
    // Make sure elements exist before initializing
    const socket = io(); // Initialize Socket.IO connection
    const network = new NetworkManager(socket);
    network.setupSocketListeners(); // Setup listeners
    
    const renderer = new Renderer(canvas, network);
    const input = new InputManager();
    const tutorial = new TutorialManager();
    const settings = new SettingsManager();

    let gameLoopId;
    let currentRoomId = null;

    // --- URL PARAMS (Auto-Join / Share) ---
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRoom = urlParams.get('room');
    if (sharedRoom) {
        if(roomCodeInput) roomCodeInput.value = sharedRoom;
    }

    // --- SHARE BUTTON LOGIC ---
    if(shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (!currentRoomId) return;
            
            const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
            navigator.clipboard.writeText(url).then(() => {
                const originalText = shareBtn.innerText;
                shareBtn.innerText = 'COPIED!';
                setTimeout(() => shareBtn.innerText = originalText, 2000);
            }).catch(err => {
                console.error('Failed to copy', err);
                prompt("Copy this link:", url);
            });
        });
    }

    // --- GAME LOOP ---
    function gameLoop() {
        // 1. Send Input
        const inputState = input.getInput();
        
        if (inputState.up) network.emit('input', 'UP');
        if (inputState.down) network.emit('input', 'DOWN');
        if (inputState.left) network.emit('input', 'LEFT');
        if (inputState.right) network.emit('input', 'RIGHT');
        
        if (inputState.hit) network.emit('input', 'HIT');
        if (inputState.slam) network.emit('input', 'SLAM');
        if (inputState.dash) network.emit('input', 'DASH');
        if (inputState.grenade) network.emit('input', 'GRENADE');
        if (inputState.thread) network.emit('input', 'THREAD');
        if (inputState.web) network.emit('input', 'WEB');

        gameLoopId = requestAnimationFrame(gameLoop);
    }

    // --- EVENT LISTENERS ---

    if(createBtn) {
        createBtn.addEventListener('click', () => {
            const name = nameInput.value || 'Player';
            network.emit('create_room', name);
        });
    }

    if(joinBtn) {
        joinBtn.addEventListener('click', () => {
            const code = roomCodeInput.value.toUpperCase();
            const name = nameInput.value || 'Player';
            if (code.length === 5) {
                network.emit('join_room', { roomId: code, playerName: name });
            } else {
                lobbyStatus.textContent = "Invalid Code";
            }
        });
    }

    // --- NETWORK EVENTS ---

    network.on('room_created', (roomId) => {
        currentRoomId = roomId;
        enterGame(roomId);
    });

    network.on('joined_room', (data) => {
        const roomId = (typeof data === 'object' && data.roomId) ? data.roomId : data;
        currentRoomId = roomId;
        enterGame(roomId);
        renderer.playIntroSequence();
    });

    network.on('error', (msg) => {
        lobbyStatus.textContent = msg;
    });

    network.on('game_over', (data) => {
        // Handle game over logic
    });

    network.on('map_update', (obstacles) => {
        renderer.setObstacles(obstacles);
    });

    network.on('game_event', (event) => {
        if (event.type === 'hit') {
            renderer.triggerHitEffect(event.from, event.to, event.damage);
        } else if (event.type === 'swing') {
            renderer.triggerSwing(event.player);
        } else if (event.type === 'bounce') {
            renderer.triggerBounce(event.player);
        } else if (event.type === 'grenade_explode') {
            renderer.createExplosion(event.x, event.y, '#ffaa00');
            renderer.addShake(10);
        } else if (event.type === 'floating_text') {
            renderer.addFloatingText(event.x, event.y, event.text, event.color);
        } else if (event.type === 'thread_hit') {
            renderer.playerRenderer.addSizeEffect(event.from, event.fromSize, 300);
            renderer.playerRenderer.addSizeEffect(event.to, event.toSize, 300);
            renderer.addFloatingText(event.x, event.y, "DRAIN!", "#00ff00");
        } else if (event.type === 'web_hit') {
            renderer.addFloatingText(event.x, event.y, "STUCK!", "#ffffff");
            renderer.playerRenderer.triggerAnimation(event.to, 'stunned', 2000, { isHit: false });
        }
    });

    // --- HELPERS ---

    function enterGame(roomId) {
        lobbyContainer.style.display = 'none';
        gameUI.style.display = 'block';
        roomDisplay.textContent = `ROOM: ${roomId}`;
        
        // Start Rendering
        renderer.start();
        
        // Start Input Loop
        if (!gameLoopId) gameLoop();
        
        // Resize just in case
        renderer.resize();
    }

    // Global Resize
    window.addEventListener('resize', () => {
        if (renderer) renderer.resize();
    });
});
