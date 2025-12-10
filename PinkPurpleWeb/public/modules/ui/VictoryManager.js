import { PlayerRenderer } from '../renderers/PlayerRenderer.js';
import { GAME_CONFIG, COLORS } from '../constants.js';

export class VictoryManager {
    constructor(networkManager) {
        this.network = networkManager;
        this.modal = document.getElementById('victory-modal');
        this.canvas = document.getElementById('victory-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.title = document.getElementById('victory-title');
        this.message = document.getElementById('victory-message');
        this.restartBtn = document.getElementById('restart-btn');
        
        this.playerRenderer = this.ctx ? new PlayerRenderer(this.ctx) : null;
        this.animationId = null;
        this.winnerId = null;
        this.countdown = 3;
        
        if (this.restartBtn) {
            this.restartBtn.addEventListener('click', () => {
                this.hide();
                // Optional: Emit restart request if needed, currently server restarts auto
            });
        }

        // Listen for game over
        this.network.on('game_over', (data) => {
            this.show(data.winner);
        });
        
        // Listen for new game start (map update is a good proxy or score reset)
        this.network.on('score', (scores) => {
            if (scores.p1 === 0 && scores.p2 === 0 && this.modal.style.display === 'flex') {
                this.hide();
            }
        });
    }

    show(winnerId) {
        if (!this.modal || !this.ctx) return;
        
        this.winnerId = winnerId;
        this.modal.style.display = 'flex';
        
        const isP1 = winnerId === 'p1';
        this.title.innerText = isP1 ? "PLAYER 1 WINS!" : "PLAYER 2 WINS!";
        this.title.style.color = isP1 ? GAME_CONFIG.PLAYER1_COLOR : GAME_CONFIG.PLAYER2_COLOR;
        this.title.style.textShadow = `0 0 20px ${isP1 ? GAME_CONFIG.PLAYER1_COLOR : GAME_CONFIG.PLAYER2_COLOR}`;
        
        this.message.innerText = "Magnifique performance !";
        
        this.countdown = 3;
        this.updateButtonText();
        
        // Start Countdown
        const interval = setInterval(() => {
            this.countdown--;
            this.updateButtonText();
            if (this.countdown <= 0) {
                clearInterval(interval);
            }
        }, 1000);

        // Start Animation Loop
        this.loop();
    }

    updateButtonText() {
        if (this.restartBtn) {
            this.restartBtn.innerText = `REJOUER (${this.countdown})`;
        }
    }

    hide() {
        if (this.modal) this.modal.style.display = 'none';
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    loop() {
        if (this.modal.style.display === 'none') return;

        // Clear
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Winner Dancing
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2 + 50;
        
        // Dummy Player Object for Renderer
        const color = this.winnerId === 'p1' ? GAME_CONFIG.PLAYER1_COLOR : GAME_CONFIG.PLAYER2_COLOR;
        const dummyPlayer = {
            x: centerX,
            y: centerY,
            color: color,
            victoryStance: true, // Force victory stance
            facing: 1,
            sizeMultiplier: 1.5 // Big player
        };

        // Animate Jump
        const t = Date.now() / 200;
        dummyPlayer.y += Math.sin(t) * 20;

        this.ctx.save();
        // Use PlayerRenderer to draw
        // We need to mock networkState for it
        const mockNetworkState = { players: {} };
        
        // Draw Confetti
        this.drawConfetti();

        this.playerRenderer.drawPlayerModel(dummyPlayer, 'winner', mockNetworkState);
        
        this.ctx.restore();

        this.animationId = requestAnimationFrame(() => this.loop());
    }

    drawConfetti() {
        const time = Date.now() / 1000;
        for (let i = 0; i < 20; i++) {
            const x = (Math.sin(time + i) * 150) + 150;
            const y = ((time * 100 + i * 50) % 300);
            this.ctx.fillStyle = i % 2 === 0 ? COLORS.PLAYER1_COLOR : COLORS.PLAYER2_COLOR;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
}

