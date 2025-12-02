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

// Game State
let players = {};
let mySlot = null;
const WIDTH = 1920;
const HEIGHT = 1080;
let scale = 1;

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
    if (e.code === 'ArrowDown' || e.code === 'KeyS') action = 'HIT';
    if (e.code === 'Space' || e.code === 'ShiftLeft') action = 'DASH';

    if (action) {
        socket.emit('input', action);
        // Local feedback for immediate feel
        if (action === 'UP') soundManager.playJump();
        if (action === 'DASH') soundManager.playDash();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Socket Events
socket.on('init', (data) => {
    // Switch to Game View
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'block';

    // Resume Audio Context on interaction (game start)
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Start background music
    soundManager.startBgMusic();

    mySlot = data.slot;
    if (data.obstacles) {
        metalBars = data.obstacles.map(o => ({
            ...o,
            angle: 0,
            color: `rgba(${100 + Math.random() * 50}, ${100 + Math.random() * 50}, ${110 + Math.random() * 50}, 0.8)`
        }));
    }

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
    draw(); // Start loop if not started
});

socket.on('state', (state) => {
    players = state.players;
    currentScores = state.scores;
});

socket.on('event', (event) => {
    if (event.type === 'hit') {
        createExplosion(players[event.to].x, players[event.to].y, players[event.from].color);
        document.body.classList.add('flash');
        setTimeout(() => document.body.classList.remove('flash'), 100);
        soundManager.playHit();
    }
    if (event.type === 'death') {
        // Screen shake?
        shakeIntensity = 30;
        soundManager.playNoise(0.5, 0.4); // Explosion sound
    }
    if (event.type === 'bounce') {
        soundManager.playBounce();
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
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'cyan';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.fillRect(0, HEIGHT - 100, WIDTH, 100);
    ctx.fillRect(0, 0, WIDTH, 100);
    ctx.shadowBlur = 0;
    ctx.restore();

    // --- OBSTACLES (Rendered BEHIND UI) ---
    ctx.save();
    for (const bar of metalBars) {
        ctx.translate(bar.x, bar.y);
        ctx.rotate(bar.angle);
        ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
        ctx.strokeStyle = bar.color;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
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
        ctx.stroke();
        ctx.rotate(-bar.angle);
        ctx.translate(-bar.x, -bar.y);
    }
    ctx.restore();

    // Floor Line
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#0ff';
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 40);
    ctx.lineTo(WIDTH, HEIGHT - 40);
    ctx.stroke();
    ctx.shadowBlur = 0;

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
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.stroke();
        ctx.restore();

        // Draw Player
        ctx.shadowBlur = 20;
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

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // --- UI OVERLAY (Rendered ON TOP) ---
    // Score Circles with Damage Fill
    ctx.save();
    ctx.font = "bold 80px Orbitron";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Helper to draw damage circle
    function drawDamageCircle(x, y, color, score, damage) {
        const radius = 80;

        // Background Circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();

        // Damage Fill (Red Sector)
        // Max damage visual cap at 100% (full circle) or more? Let's say 100% = full circle red.
        const damagePercent = Math.min(damage, 100) / 100;
        if (damagePercent > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            // Start from top (-PI/2) and go clockwise
            ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * damagePercent));
            ctx.lineTo(x, y);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'; // Red semi-transparent
            ctx.fill();
        }

        // Border Ring
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.shadowBlur = 30;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow for text

        // Score Text
        ctx.fillStyle = color;
        ctx.fillText(score, x, y);
    }

    // Find P1 and P2 damage from players object
    // We need to map players to P1/P2 slots. 
    // The 'players' object keys are socket IDs. We need to check 'isPlayer1' property.
    let p1Damage = 0;
    let p2Damage = 0;
    for (const id in players) {
        if (players[id].isPlayer1) p1Damage = players[id].damage;
        else p2Damage = players[id].damage;
    }

    // Left Circle (P1)
    drawDamageCircle(250, 250, '#9393D6', currentScores.p1 || 0, p1Damage);

    // Right Circle (P2)
    drawDamageCircle(WIDTH - 250, 250, '#CD62D5', currentScores.p2 || 0, p2Damage);

    ctx.restore();

    animationId = requestAnimationFrame(draw);
}

// Global score state
let currentScores = { p1: 0, p2: 0 };
