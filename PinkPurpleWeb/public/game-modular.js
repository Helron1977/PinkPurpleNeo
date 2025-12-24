import { NetworkManager } from './modules/network.js';
import { Renderer } from './modules/rendering.js';
import { InputManager } from './modules/input.js';
import { TutorialManager } from './modules/ui/TutorialManager.js';
import { SettingsManager } from './modules/ui/SettingsManager.js';
import { VictoryManager } from './modules/ui/VictoryManager.js';
import { soundManager } from './modules/audio.js';
import { GAME_CONFIG } from './modules/constants.js';

window.addEventListener('load', () => {
    const canvas = document.getElementById('game-canvas');
    const lobbyContainer = document.getElementById('lobby-container');
    const gameUI = document.getElementById('game-ui');
    const createBtn = document.getElementById('create-btn');
    const joinBtn = document.getElementById('join-btn');
    const roomCodeInput = document.getElementById('room-code-input');

    // DEBUG: Listener for Settings Debug Buttons
    window.addEventListener('debug_fatality', (e) => {
        const weapon = e.detail;
        console.log("DEBUG FATALITY:", weapon);

        // Mock a scenario if not in game or even if in game
        // Force p1 winner, p2 victim for testing
        // Need to ensure Renderer is running or start it temporarily if in lobby?
        // Let's assume user is in-game or just use the renderer instance.

        if (lobbyContainer.style.display !== 'none') {
            // If in lobby, hide it temporarily to show canvas? 
            // Or just logging? User wants to SEE animation.
            // Let's fake entering a game loop for visual test if not started
            lobbyContainer.style.display = 'none';
            gameUI.style.display = 'block';
            renderer.start();
            renderer.resize();
        }

        // Trigger sequence
        renderer.fatalitySequence = {
            active: true,
            winner: 'p1',
            victim: 'p2',
            startTime: Date.now()
        };

        // Mock players if they don't exist (e.g. fresh load)
        if (!network.players || !network.players.p1) {
            network.players = {
                p1: { x: GAME_CONFIG.WIDTH / 2 - 100, y: GAME_CONFIG.HEIGHT / 2 + 100, color: '#f0f' },
                p2: { x: GAME_CONFIG.WIDTH / 2 + 100, y: GAME_CONFIG.HEIGHT / 2 + 100, color: '#0ff' }
            };
        }

        renderer.playFatalityAnimation('p1', 'p2', weapon);

        // Play Sounds
        setTimeout(() => {
            if (weapon === 'cannon') soundManager.playNoise(0.5, 0.8);
            else soundManager.playTone(100, 'sawtooth', 0.5, 0.8);
            soundManager.playTone(50, 'sawtooth', 1.0, 0.5);
        }, 1200);
    });

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
    const victory = new VictoryManager(network);

    let myRole = null;
    let gameLoopId;
    let currentRoomId = null;

    // --- INTRO SEQUENCE ---
    const introOverlay = document.getElementById('intro-overlay');
    const introVideo = document.getElementById('intro-video');
    const skipIntroBtn = document.getElementById('skip-intro');
    const introLoader = document.getElementById('intro-loader');

    // --- FATALITY UI ---
    const fatalityUI = document.getElementById('fatality-ui');
    const fatalityBtns = document.querySelectorAll('.weapon-btn');

    // Fatality Button Logic
    fatalityBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const weapon = btn.dataset.weapon;
            network.emit('fatality_select', weapon);
            fatalityUI.style.display = 'none';
        });
    });






    // Helper to finish intro
    const finishIntro = () => {
        introOverlay.style.transition = 'opacity 1s ease';
        introOverlay.style.opacity = '0';
        setTimeout(() => {
            introOverlay.style.display = 'none';
            introVideo.pause();
            introVideo.currentTime = 0;
            // Optional: introVideo.src = ""; // Radical stop if needed, but prevents replay without reload. 
            // Pause + display:none should be enough usually. 
            // If sound persists, it means pause() failed or wasn't called.
            lobbyContainer.style.display = 'flex'; // Show Lobby
        }, 1000);
    };

    // ALWAYS PLAY INTRO
    introVideo.muted = false;
    introVideo.volume = 0.6;

    // Loader Logic: Wait for data
    introVideo.addEventListener('canplay', () => {
        if (introLoader) introLoader.style.display = 'none';
        introVideo.style.opacity = '1';
    });

    // Fallback if 'canplay' already fired
    if (introVideo.readyState >= 3) {
        if (introLoader) introLoader.style.display = 'none';
        introVideo.style.opacity = '1';
    }

    // Start Playback
    const playPromise = introVideo.play();
    if (playPromise !== undefined) {
        playPromise.then(_ => {
            // Autoplay started!
            setTimeout(() => { skipIntroBtn.style.opacity = '1'; }, 2000);
        }).catch(error => {
            // Autoplay prevented. Fallback: Muted
            introVideo.muted = true;
            introVideo.play();
            setTimeout(() => { skipIntroBtn.style.opacity = '1'; }, 2000);
        });
    }

    introVideo.addEventListener('ended', finishIntro);
    skipIntroBtn.addEventListener('click', finishIntro);


    // --- URL PARAMS (Auto-Join / Share) ---
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRoom = urlParams.get('room');
    if (sharedRoom) {
        if (roomCodeInput) roomCodeInput.value = sharedRoom;
    }

    // --- SHARE BUTTON LOGIC ---
    if (shareBtn) {
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

    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const name = nameInput.value || 'Player';
            network.emit('create_room', name);
        });
    }

    if (joinBtn) {
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
        if (typeof data === 'object' && data.role) {
            myRole = data.role;
        }
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
        renderer.reset();
        renderer.setObstacles(obstacles);
    });

    network.on('game_event', (event) => {
        if (event.type === 'hit') {
            renderer.triggerHitEffect(event.from, event.to, event.damage);
            soundManager.playHit();
        } else if (event.type === 'swing') {
            renderer.triggerSwing(event.player);
            // Petit son de swing
            soundManager.playTone(300, 'triangle', 0.05, 0.05);
        } else if (event.type === 'bounce') {
            renderer.triggerBounce(event.player);
            soundManager.playBounce();
        } else if (event.type === 'slam_impact') {
            renderer.addShake(20); // Heavy Shake
            renderer.createExplosion(event.x, event.y, '#fff'); // White Shockwave
            soundManager.playNoise(0.3, 0.5); // Impact Noise
            soundManager.playTone(60, 'sawtooth', 0.3, 0.5); // Deep Bass
        } else if (event.type === 'grenade_explode') {
            renderer.createExplosion(event.x, event.y, '#ffaa00');
            renderer.addShake(10);
            soundManager.playNoise(0.4, 0.4); // Boom
        } else if (event.type === 'floating_text') {
            renderer.addFloatingText(event.x, event.y, event.text, event.color);
        } else if (event.type === 'thread_hit') {
            renderer.playerRenderer.addSizeEffect(event.from, event.fromSize, 300);
            renderer.playerRenderer.addSizeEffect(event.to, event.toSize, 300);
            renderer.addFloatingText(event.x, event.y, "DRAIN!", "#00ff00");
            soundManager.playTone(600, 'sawtooth', 0.2, 0.2);
        } else if (event.type === 'web_hit') {
            renderer.addFloatingText(event.x, event.y, "STUCK!", "#ffffff");
            renderer.playerRenderer.triggerAnimation(event.to, 'stunned', 2000, { isHit: false });
            soundManager.playTone(150, 'square', 0.3, 0.2);
        } else if (event.type === 'victory_dance') {
            // Géré par VictoryManager via l'événement 'game_over' ou 'victory_dance'
            soundManager.playWin();
        } else if (event.type === 'fatality_start') {
            // Trigger Fatality Sequence
            renderer.fatalitySequence = {
                active: true,
                winner: event.winner,
                victim: event.victim,
                startTime: Date.now()
            };
            renderer.slowMotionFactor = 0.1; // Slow time
            soundManager.playTone(50, 'sawtooth', 2.0, 0.8); // Drone
            soundManager.playTone(100, 'square', 1.0, 0.5); // Impact

            // Show Selection UI if we are the winner
            if (myRole === event.winner) {
                fatalityUI.style.display = 'flex';
            }
        } else if (event.type === 'fatality_action') {
            // PLAY ANIMATION
            renderer.playFatalityAnimation(event.winner, event.victim, event.weapon);
            fatalityUI.style.display = 'none'; // Hide just in case

            // Sounds
            setTimeout(() => {
                if (event.weapon === 'cannon') soundManager.playNoise(0.5, 0.8); // BOOM
                else soundManager.playTone(100, 'sawtooth', 0.5, 0.8); // WHACK

                soundManager.playTone(50, 'sawtooth', 1.0, 0.5); // Fall off
            }, 1200); // Sync with impact time in Renderer
        }
    });

    // --- HELPERS ---

    function enterGame(roomId) {
        lobbyContainer.style.display = 'none';
        gameUI.style.display = 'block';
        roomDisplay.textContent = `ROOM: ${roomId}`;

        // Start Rendering
        renderer.start();

        // Start Audio
        soundManager.cyberpunk.start();

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
