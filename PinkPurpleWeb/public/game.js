const socket = io();
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// UI Elements
const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code-input');
const lobbyStatus = document.getElementById('lobby-status');
const roomDisplay = document.getElementById('room-display');
const statusText = document.getElementById('status-text');

// Lobby Logic
createBtn.addEventListener('click', () => {
    socket.emit('create_room');
});

joinBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (code) {
        socket.emit('join_room', code);
    } else {
        lobbyStatus.innerText = "ENTER A CODE";
    }
});

socket.on('error_msg', (msg) => {
    lobbyStatus.innerText = msg;
});

// Handle room creation
socket.on('room_created', (roomId) => {
    // Automatically join the room we just created
    socket.emit('join_room', roomId);
});

// Handle joining a room
socket.on('joined_room', (data) => {
    // Switch to Game View
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'block';

    // Resume Audio Context on interaction (game start)
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Start background music
    soundManager.startBgMusic();

    mySlot = data.role;

    if (data.roomId) {
        roomDisplay.innerText = `ROOM: ${data.roomId}`;
    }

    if (mySlot === 'spectator') {
        statusText.innerText = 'Spectating...';
    } else {
        statusText.innerText = `You are ${mySlot === 'p1' ? 'Player 1 (Violet)' : 'Player 2 (Pink)'}`;
    }

    // Trigger resize to ensure canvas is correct
    resize();
});

// Handle errors
socket.on('error', (msg) => {
    lobbyStatus.innerText = msg;
});

// Game State
let players = {};
let mySlot = null;
const WIDTH = 1920;
const HEIGHT = 1080;
let scale = 1;

// Optimized blur caching - pre-render static elements with blur
const blurCache = {
    floorLine: null,
    backgroundGlow: null,
    obstacles: new Map(), // Cache obstacles by their properties
    initialized: false
};

function initBlurCache() {
    if (blurCache.initialized) return;

    // Pre-render floor line with blur
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = WIDTH;
    floorCanvas.height = 50;
    const floorCtx = floorCanvas.getContext('2d');
    floorCtx.strokeStyle = '#0ff';
    floorCtx.lineWidth = 3;
    floorCtx.shadowBlur = 10;
    floorCtx.shadowColor = '#0ff';
    floorCtx.beginPath();
    floorCtx.moveTo(0, 10);
    floorCtx.lineTo(WIDTH, 10);
    floorCtx.stroke();
    blurCache.floorLine = floorCanvas;

    // Pre-render background glow
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = WIDTH;
    bgCanvas.height = HEIGHT;
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.shadowBlur = 20;
    bgCtx.shadowColor = 'cyan';
    bgCtx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    bgCtx.fillRect(0, 0, WIDTH, 100);
    bgCtx.fillRect(0, HEIGHT - 100, WIDTH, 100);
    blurCache.backgroundGlow = bgCanvas;

    blurCache.initialized = true;
}

// === VISUAL FEEDBACK SYSTEM ===
let floatingMessages = [];
let playerCooldowns = {
    p1: { dash: 0, grenades: 3 },
    p2: { dash: 0, grenades: 3 }
};

// Add floating damage text
function addFloatingDamage(x, y, damage, color) {
    floatingMessages.push({
        x, y,
        text: `+${damage}`,
        color,
        life: 1.0,
        vy: -2,
        vx: (Math.random() - 0.5) * 1
    });
}

// Add floating action text
function addFloatingText(x, y, text, color = '#fff') {
    floatingMessages.push({
        x, y,
        text,
        color,
        life: 1.0,
        vy: -1.5,
        vx: 0
    });
}

// Update and draw floating messages
function updateFloatingMessages() {
    for (let i = floatingMessages.length - 1; i >= 0; i--) {
        const msg = floatingMessages[i];
        msg.y += msg.vy;
        msg.x += msg.vx;
        msg.life -= 0.02;

        if (msg.life <= 0) {
            floatingMessages.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.globalAlpha = msg.life;
        ctx.font = 'bold 40px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillStyle = msg.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(msg.text, msg.x, msg.y);
        ctx.fillText(msg.text, msg.x, msg.y);
        ctx.restore();
    }
}

// Draw cooldown circle indicator
function drawCooldownCircle(x, y, percent, color, label) {
    const radius = 25;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();

    if (percent < 1) {
        ctx.beginPath();
        ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * percent));
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
}

// Draw player cooldowns
function drawPlayerCooldowns(x, y, playerId) {
    const cooldown = playerCooldowns[playerId];
    if (!cooldown) return;

    const dashPercent = 1 - (cooldown.dash / 60);
    drawCooldownCircle(x - 35, y, dashPercent, '#00ffaa', '⚡');

    for (let i = 0; i < 3; i++) {
        const gx = x + 35 + (i * 30);
        const available = i < cooldown.grenades;
        drawCooldownCircle(gx, y, available ? 1 : 0, available ? '#ffaa00' : '#333', '💣');
    }
}


// Background Image
const bgImage = new Image();
bgImage.src = 'decor.png';

// Background Elements (Metal Bars)
let metalBars = [];

// Resize handling
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    scale = Math.min(canvas.width / WIDTH, canvas.height / HEIGHT);
}
window.addEventListener('resize', resize);
resize();

// --- AUDIO SYSTEM ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const soundManager = {
    playTone: (freq, type, duration, vol = 0.1) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    playNoise: (duration, vol = 0.2) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        noise.connect(gain);
        gain.connect(audioCtx.destination);
        noise.start();
    },
    playJump: () => {
        // Slide up
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square'; // 8-bit sound
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    },
    playDash: () => {
        // Quick noise burst + slide
        soundManager.playNoise(0.15, 0.2);
        soundManager.playTone(800, 'sawtooth', 0.1, 0.04);
    },
    playBounce: () => {
        // Short percussive sound for bouncing
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime); // Increased from 0.05 to 0.15
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    },
    playHit: () => {
        soundManager.playNoise(0.3, 0.3);
        soundManager.playTone(100, 'square', 0.2, 0.15);
    },
    playWin: () => {
        // Arpeggio
        [440, 554, 659, 880].forEach((f, i) => {
            setTimeout(() => soundManager.playTone(f, 'sine', 0.5, 0.2), i * 100);
        });
    },
    // 8-bit Background Music - Slower, more atmospheric
    bgMusicInterval: null,
    startBgMusic: () => {
        if (soundManager.bgMusicInterval) return; // Already playing

        // Longer, more atmospheric melody (C major scale with variations)
        const melody = [
            { note: 261.63, duration: 0.6 }, // C4
            { note: 329.63, duration: 0.6 }, // E4
            { note: 392.00, duration: 0.6 }, // G4
            { note: 329.63, duration: 0.3 }, // E4
            { note: 293.66, duration: 0.3 }, // D4
            { note: 261.63, duration: 0.6 }, // C4
            { note: 0, duration: 0.3 },      // Rest
            { note: 392.00, duration: 0.6 }, // G4
            { note: 440.00, duration: 0.6 }, // A4
            { note: 392.00, duration: 0.6 }, // G4
            { note: 329.63, duration: 0.3 }, // E4
            { note: 293.66, duration: 0.3 }, // D4
            { note: 261.63, duration: 0.6 }, // C4
            { note: 0, duration: 0.3 },      // Rest
            { note: 293.66, duration: 0.6 }, // D4
            { note: 329.63, duration: 0.6 }, // E4
            { note: 293.66, duration: 0.6 }, // D4
            { note: 261.63, duration: 0.9 }, // C4 (longer)
            { note: 0, duration: 0.6 },      // Rest (longer pause)
        ];

        let noteIndex = 0;

        const playNote = () => {
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const currentNote = melody[noteIndex];

            // Skip if it's a rest (note = 0)
            if (currentNote.note > 0) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'triangle'; // Softer sound than square
                osc.frequency.setValueAtTime(currentNote.note, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.02, audioCtx.currentTime); // Lower volume
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + currentNote.duration);

                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + currentNote.duration);
            }

            noteIndex = (noteIndex + 1) % melody.length;
        };

        playNote(); // Play first note immediately
        soundManager.bgMusicInterval = setInterval(() => {
            playNote();
        }, 600); // Slower tempo: 600ms between notes instead of 200ms
    },
    stopBgMusic: () => {
        if (soundManager.bgMusicInterval) {
            clearInterval(soundManager.bgMusicInterval);
            soundManager.bgMusicInterval = null;
        }
    }
};

// Input Handling
const keys = {};
window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }

    if (keys[e.code]) return; // Prevent repeat
    keys[e.code] = true;

    let action = null;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') action = 'LEFT';
    if (e.code === 'ArrowRight' || e.code === 'KeyD') action = 'RIGHT';
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyZ') action = 'UP';
    if (e.code === 'ArrowDown' || e.code === 'KeyS') action = 'SLAM'; // Changed from HIT to SLAM
    if (e.code === 'Space') action = 'HIT'; // Space is now attack
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') action = 'DASH'; // Shift for dash
    if (e.code === 'KeyG') action = 'GRENADE'; // G key for grenade

    if (action) {
        socket.emit('input', action);
        // Local feedback for immediate feel
        if (action === 'UP') soundManager.playJump();
        if (action === 'DASH') soundManager.playDash();
        if (action === 'SLAM') soundManager.playNoise(0.2, 0.4); // Slam sound
        if (action === 'GRENADE') soundManager.playTone(400, 'square', 0.1, 0.1); // Grenade throw sound
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Grenade and explosion state
let grenades = [];
let explosions = [];

socket.on('state', (state) => {
    players = state.players;
    currentScores = state.scores;
    grenades = state.grenades || [];
});

// Binary state protocol handler
socket.on('state_bin', (buf) => {
    const data = new Uint8Array(buf);
    let offset = 0;

    // 1. Scores
    currentScores = {
        p1: data[offset++],
        p2: data[offset++]
    };

    // Helper to read player
    const readPlayer = (playerId) => {
        const flags = data[offset++];
        const active = (flags & 1) !== 0;

        if (!active) {
            offset += 5; // Skip remaining bytes
            return null;
        }

        const isHit = (flags & 2) !== 0;
        const grenadeCount = (flags >> 2) & 0x03;
        const damage = data[offset++];

        // Read coordinates (Int16LE, scaled by 10)
        const x = ((data[offset + 1] << 8) | data[offset]) / 10;
        offset += 2;
        const y = ((data[offset + 1] << 8) | data[offset]) / 10;
        offset += 2;

        // Convert to signed if needed
        const xSigned = x > 32767 / 10 ? x - 65536 / 10 : x;
        const ySigned = y > 32767 / 10 ? y - 65536 / 10 : y;

        return {
            x: xSigned,
            y: ySigned,
            damage: damage,
            isHit: isHit,
            grenadeCount: grenadeCount,
            color: playerId === 'p1' ? '#9393D6' : '#CD62D5'
        };
    };

    // 2. Players
    players = {
        p1: readPlayer('p1'),
        p2: readPlayer('p2')
    };

    // Remove null players
    if (!players.p1) delete players.p1;
    if (!players.p2) delete players.p2;

    // 3. Grenades
    const grenadeCount = data[offset++];
    grenades = [];
    for (let i = 0; i < grenadeCount; i++) {
        const gx = ((data[offset + 1] << 8) | data[offset]) / 10;
        offset += 2;
        const gy = ((data[offset + 1] << 8) | data[offset]) / 10;
        offset += 2;
        const age = data[offset++];

        const gxSigned = gx > 32767 / 10 ? gx - 65536 / 10 : gx;
        const gySigned = gy > 32767 / 10 ? gy - 65536 / 10 : gy;

        grenades.push({
            x: gxSigned,
            y: gySigned,
            age: age
        });
    }
});



socket.on('event', (event) => {
    if (event.type === 'hit') {
        const target = players[event.to];
        if (target) {
            createExplosion(target.x, target.y, players[event.from].color);
            // Add floating damage text
            addFloatingDamage(target.x, target.y, event.damage || 10, '#ff0000');
        }
        document.body.classList.add('flash');
        setTimeout(() => document.body.classList.remove('flash'), 100);
        soundManager.playHit();
    }
    if (event.type === 'death') {
        shakeIntensity = 30;
        soundManager.playNoise(0.5, 0.4);
        // Add death message
        const deadPlayer = event.player === 'p1' ? players.p1 : players.p2;
        if (deadPlayer) {
            addFloatingText(deadPlayer.x, deadPlayer.y, 'K.O.!', '#ff0000');
        }
    }
    if (event.type === 'bounce') {
        soundManager.playBounce();
    }
    if (event.type === 'grenade_explode') {
        explosions.push({
            x: event.x,
            y: event.y,
            radius: event.radius,
            age: 0
        });
        shakeIntensity = 40;
        soundManager.playNoise(0.6, 0.5);
        soundManager.playTone(60, 'sine', 0.4, 0.2);
        addFloatingText(event.x, event.y, 'BOOM!', '#ffff00');
    }
    if (event.type === 'grenade_hit') {
        soundManager.playHit();
        if (event.target && players[event.target]) {
            addFloatingDamage(players[event.target].x, players[event.target].y, event.damage || 10, '#ff8800');
        }
    }
});

socket.on('game_over', (data) => {
    soundManager.playWin();
    const winnerName = data.winner === 'p1' ? 'VIOLET' : 'PINK';
    const color = data.winner === 'p1' ? '#9393D6' : '#CD62D5';

    const msg = document.createElement('div');
    msg.style.position = 'absolute';
    msg.style.top = '50%';
    msg.style.left = '50%';
    msg.style.transform = 'translate(-50%, -50%)';
    msg.style.fontSize = '100px';
    msg.style.fontWeight = 'bold';
    msg.style.color = color;
    msg.style.textShadow = `0 0 50px ${color}`;
    msg.style.fontFamily = 'Orbitron, sans-serif';
    msg.style.zIndex = '1000';
    msg.innerText = `${winnerName} WINS`;
    document.body.appendChild(msg);

    setTimeout(() => {
        msg.remove();
    }, 3000);
});

socket.on('map_update', (newObstacles) => {
    if (newObstacles) {
        metalBars = newObstacles.map(o => ({
            ...o,
            angle: 0,
            color: `rgba(${100 + Math.random() * 50}, ${100 + Math.random() * 50}, ${110 + Math.random() * 50}, 0.8)`
        }));
    }
});

// Rendering
const particles = [];
let shakeIntensity = 0;

function createExplosion(x, y, color) {
    for (let i = 0; i < 20; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: color
        });
    }
    // Trigger shake
    shakeIntensity = 20;
}

// Trail history for players
const trails = {}; // Map<id, Array<{x, y}>>

let animationId;
function draw() {
    // Shake Decay
    if (shakeIntensity > 0) shakeIntensity *= 0.9;
    if (shakeIntensity < 0.5) shakeIntensity = 0;

    const shakeX = (Math.random() - 0.5) * shakeIntensity;
    const shakeY = (Math.random() - 0.5) * shakeIntensity;

    // Clear screen
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply Shake to Game Transform
    ctx.setTransform(scale, 0, 0, scale, (canvas.width - WIDTH * scale) / 2 + shakeX, (canvas.height - HEIGHT * scale) / 2 + shakeY);

    // --- TRON BACKGROUND ---
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
    const horizonY = HEIGHT / 2;
    const centerX = WIDTH / 2;
    for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX + i * 50, horizonY + 50);
        ctx.lineTo(centerX + i * 400, HEIGHT);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + i * 50, horizonY - 50);
        ctx.lineTo(centerX + i * 400, 0);
        ctx.stroke();
    }
    const timeOffset = (Date.now() / 50) % 100;
    for (let y = horizonY + 50; y < HEIGHT; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y + timeOffset);
        ctx.lineTo(WIDTH, y + timeOffset);
        ctx.stroke();
    }
    for (let y = horizonY - 50; y > 0; y -= 80) {
        ctx.beginPath();
        ctx.moveTo(0, y - timeOffset);
        ctx.lineTo(WIDTH, y - timeOffset);
        ctx.stroke();
    }
    // Use pre-rendered background glow (no blur calculation needed)
    if (!blurCache.initialized) initBlurCache();
    ctx.drawImage(blurCache.backgroundGlow, 0, 0);
    ctx.restore();

    // --- OBSTACLES (Rendered BEHIND UI) ---
    // Optimize: render obstacles without blur, or use cached versions
    ctx.save();
    for (const bar of metalBars) {
        ctx.translate(bar.x, bar.y);
        ctx.rotate(bar.angle);
        ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
        ctx.strokeStyle = bar.color;
        ctx.lineWidth = 4;
        // Reduced blur for better performance - or remove entirely for static obstacles
        ctx.shadowBlur = 8; // Reduced from 15
        ctx.shadowColor = bar.color;
        ctx.fillRect(0, 0, bar.w, bar.h);
        ctx.strokeRect(0, 0, bar.w, bar.h);
        ctx.beginPath();
        ctx.moveTo(10, 10);
        ctx.lineTo(bar.w - 10, bar.h - 10);
        ctx.moveTo(bar.w - 10, 10);
        ctx.lineTo(10, bar.h - 10);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0; // No blur for inner lines
        ctx.stroke();
        ctx.rotate(-bar.angle);
        ctx.translate(-bar.x, -bar.y);
    }
    ctx.restore();

    // Floor Line - use pre-rendered version
    if (!blurCache.initialized) initBlurCache();
    ctx.drawImage(blurCache.floorLine, 0, HEIGHT - 40);

    // Players
    for (const id in players) {
        const p = players[id];

        // Update Trail
        if (!trails[id]) trails[id] = [];
        trails[id].push({ x: p.x, y: p.y });
        if (trails[id].length > 20) trails[id].shift(); // Keep last 20 frames

        // Draw Trail
        ctx.save();
        ctx.beginPath();
        if (trails[id].length > 0) {
            ctx.moveTo(trails[id][0].x, trails[id][0].y);
            for (let i = 1; i < trails[id].length; i++) {
                ctx.lineTo(trails[id][i].x, trails[id][i].y);
            }
        }
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.4; // Semi-transparent trail
        // Reduced blur for trails - less expensive
        ctx.shadowBlur = 6; // Reduced from 10
        ctx.shadowColor = p.color;
        ctx.stroke();
        ctx.restore();

        // Draw Player
        // Keep blur for players (important visual effect) but optimize
        ctx.shadowBlur = 15; // Reduced from 20
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.fillStyle = p.color;
        const r = 25 + Math.sin(Date.now() / 100) * 2;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        if (p.isHit) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    // Grenades - reduced blur for better performance
    for (const g of grenades) {
        ctx.save();
        ctx.shadowBlur = 10; // Reduced from 15
        ctx.shadowColor = '#ff0';
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.age += 0.05;

        ctx.save();
        ctx.globalAlpha = 1 - exp.age;
        ctx.shadowBlur = 20; // Reduced from 30
        ctx.shadowColor = '#ff0';
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius * exp.age, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (exp.age >= 1) {
            explosions.splice(i, 1);
        }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 5, 5);
        ctx.globalAlpha = 1;
    }

    // --- UI OVERLAY (Rendered ON TOP) ---
    // Score Circles with Damage Fill
    ctx.save();
    ctx.font = "bold 80px Orbitron";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Helper to draw damage circle
    function drawDamageCircle(x, y, color, score, damage, grenadeCount) {
        const radius = 80;

        // Background Circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();

        // Damage Fill (Red Sector)
        const damagePercent = Math.min(damage, 100) / 100;
        if (damagePercent > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * damagePercent));
            ctx.lineTo(x, y);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            ctx.fill();
        }

        // Border Ring - reduced blur for UI elements
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.shadowBlur = 20; // Reduced from 30
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Score Text
        ctx.fillStyle = color;
        ctx.fillText(score, x, y);

        // Grenade Indicators
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x - 30 + i * 30, y + 100, 10, 0, Math.PI * 2);
            if (i < grenadeCount) {
                ctx.fillStyle = 'red';
                ctx.shadowBlur = 6; // Reduced from 10
                ctx.shadowColor = 'red';
            } else {
                ctx.fillStyle = '#333';
                ctx.shadowBlur = 0;
            }
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    // Get P1 and P2 stats
    let p1Damage = 0;
    let p2Damage = 0;
    let p1Grenades = 0;
    let p2Grenades = 0;

    if (players.p1) {
        p1Damage = players.p1.damage || 0;
        p1Grenades = players.p1.grenadeCount || 0;
    }
    if (players.p2) {
        p2Damage = players.p2.damage || 0;
        p2Grenades = players.p2.grenadeCount || 0;
    }

    // Left Circle (P1)
    if (currentScores) {
        drawDamageCircle(250, 250, '#9393D6', currentScores.p1 || 0, p1Damage, p1Grenades);

        // Right Circle (P2)
        drawDamageCircle(WIDTH - 250, 250, '#CD62D5', currentScores.p2 || 0, p2Damage, p2Grenades);
    }

    ctx.restore();

    animationId = requestAnimationFrame(draw);
}

// Start animation loop
let currentScores = { p1: 0, p2: 0 };
initBlurCache(); // Initialize blur cache before first draw
draw();

// --- TOUCH CONTROLS SETUP (Mobile) ---
// Note: These elements need to be defined in the HTML for this to work
// Check if touch control elements exist before setting them up
if (document.getElementById('touch-controls')) {
    const touchControls = document.getElementById('touch-controls');
    const joystickZone = document.getElementById('joystick-zone');
    const joystickKnob = document.getElementById('joystick-knob');
    const btnAttack = document.getElementById('btn-attack');
    const btnDash = document.getElementById('btn-dash');
    const btnGrenade = document.getElementById('btn-grenade');
    const btnSlam = document.getElementById('btn-slam');

    // Check if device supports touch
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        // It's likely a mobile device or tablet
        touchControls.style.display = 'flex';
        const controlsHint = document.getElementById('controls-hint');
        if (controlsHint) {
            controlsHint.style.display = 'none'; // Hide keyboard hints
        }
    }

    // Joystick Variables
    let joystickActive = false;
    let joystickCenter = { x: 0, y: 0 };
    let joystickTouchId = null;
    let lastJoystickAction = null; // Track last action to prevent spam

    // Joystick Events
    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        joystickTouchId = touch.identifier;
        joystickActive = true;
        lastJoystickAction = null; // Reset action on new touch

        const rect = joystickZone.getBoundingClientRect();
        joystickCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };

        updateJoystick(touch);
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joystickActive) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                updateJoystick(e.changedTouches[i]);
                break;
            }
        }
    }, { passive: false });

    joystickZone.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                resetJoystick();
                break;
            }
        }
    }, { passive: false });

    function updateJoystick(touch) {
        const maxDist = 50; // Max movement radius
        const dx = touch.clientX - joystickCenter.x;
        const dy = touch.clientY - joystickCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Constrain movement to max distance
        const constrainedDist = Math.min(dist, maxDist);
        const moveX = (dx / dist) * constrainedDist;
        const moveY = (dy / dist) * constrainedDist;

        // Update knob position
        joystickKnob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

        // Determine Direction based on 3 distinct segments (LEFT, UP, RIGHT)
        // Use coordinate-based detection for better precision and reactivity
        let currentAction = null;

        if (dist > 15) { // Deadzone
            const absX = Math.abs(dx);
            const absY = Math.abs(dy);

            // Define segment boundaries - prioritize horizontal for LEFT/RIGHT
            const horizontalThreshold = 20; // Minimum X movement for LEFT/RIGHT
            const verticalThreshold = 25; // Minimum Y movement for UP

            // Priority 1: Strong horizontal movement (LEFT or RIGHT)
            // This ensures RIGHT works perfectly even when perfectly horizontal
            if (absX > horizontalThreshold) {
                if (dx > 0) {
                    currentAction = 'RIGHT';
                } else {
                    currentAction = 'LEFT';
                }
            }
            // Priority 2: Strong vertical movement UP (only if not too horizontal)
            else if (dy < -verticalThreshold && absX < horizontalThreshold) {
                currentAction = 'UP';
            }
            // Priority 3: Weak movement - use angle-based detection
            else {
                const angle = Math.atan2(dy, dx);
                // RIGHT: -60° to 60° (wide range for better detection)
                // UP: -120° to -60°
                // LEFT: rest (120° to -120°)
                if (angle > -Math.PI / 3 && angle < Math.PI / 3) {
                    currentAction = 'RIGHT';
                } else if (angle > -2 * Math.PI / 3 && angle < -Math.PI / 3) {
                    currentAction = 'UP';
                } else {
                    currentAction = 'LEFT';
                }
            }
        }

        // Only send if action changed (prevent spam)
        if (currentAction !== lastJoystickAction) {
            if (currentAction) {
                sendTouchAction(currentAction);
            }
            lastJoystickAction = currentAction;
        }
    }

    function resetJoystick() {
        joystickActive = false;
        joystickTouchId = null;
        lastJoystickAction = null;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
    }

    // Button Events
    function setupButton(btn, action) {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendTouchAction(action);
            btn.style.transform = 'scale(0.9)';
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            btn.style.transform = 'scale(1)';
        }, { passive: false });
    }

    setupButton(btnAttack, 'HIT');
    setupButton(btnDash, 'DASH');
    setupButton(btnGrenade, 'GRENADE');
    setupButton(btnSlam, 'SLAM');

    // Helper to send action via socket
    function sendTouchAction(action) {
        socket.emit('input', action);
        // Local feedback
        if (action === 'UP') soundManager.playJump();
        if (action === 'DASH') soundManager.playDash();
        if (action === 'SLAM') soundManager.playNoise(0.2, 0.4);
        if (action === 'GRENADE') soundManager.playTone(400, 'square', 0.1, 0.1);
    }
}

// --- AUTO HIDE CONTROLS HINT (PC) ---
const controlsHint = document.getElementById('controls-hint');
if (controlsHint) {
    let hintTimeout;

    function showControlsHint() {
        const touchControls = document.getElementById('touch-controls');
        if (touchControls && touchControls.style.display === 'flex') return; // Don't show on mobile

        controlsHint.style.opacity = '1';
        clearTimeout(hintTimeout);
        hintTimeout = setTimeout(() => {
            controlsHint.style.opacity = '0';
        }, 5000); // Hide after 5 seconds
    }

    // Show hint on game init
    socket.on('init', () => {
        showControlsHint();
    });

    // Hook into death event for respawn hint
    socket.on('event', (event) => {
        if (event.type === 'death') {
            showControlsHint();
        }
    });

    // Initial show
    showControlsHint();
}
