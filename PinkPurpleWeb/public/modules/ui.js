/**
 * UI Module
 * Handles lobby, game UI, and controls hints
 */

export class UIManager {
    constructor() {
        this.lobbyContainer = document.getElementById('lobby-container');
        this.gameContainer = document.getElementById('game-ui');
        this.lobbyStatus = document.getElementById('lobby-status');
        this.roomDisplay = document.getElementById('room-display');
        this.statusText = document.getElementById('status-text');
        this.controlsHint = document.getElementById('controls-hint');
        this.hintTimeout = null;
    }

    // Show lobby
    showLobby() {
        this.lobbyContainer.style.display = 'block';
        this.gameContainer.style.display = 'none';
    }

    // Show game
    showGame() {
        if (this.lobbyContainer) {
            this.lobbyContainer.style.display = 'none';
        }
        this.gameContainer.style.display = 'block';
    }

    // Update lobby status
    setLobbyStatus(message) {
        this.lobbyStatus.innerText = message;
    }

    // Update room display
    setRoomCode(roomId) {
        this.roomDisplay.innerText = `ROOM: ${roomId}`;
    }

    // Update player status
    setPlayerStatus(slot) {
        if (slot === 'spectator') {
            this.statusText.innerText = 'Spectating...';
        } else {
            const playerName = slot === 'p1' ? 'Player 1 (Violet)' : 'Player 2 (Pink)';
            this.statusText.innerText = `You are ${playerName}`;
        }
    }

    // Show controls hint
    showControlsHint() {
        if (!this.controlsHint) return;

        const touchControls = document.getElementById('touch-controls');
        if (touchControls && touchControls.style.display === 'flex') return;

        this.controlsHint.style.opacity = '1';
        clearTimeout(this.hintTimeout);
        this.hintTimeout = setTimeout(() => {
            this.controlsHint.style.opacity = '0';
        }, 5000);
    }

    // Show game over message
    showGameOver(winner) {
        const winnerName = winner === 'p1' ? 'VIOLET' : 'PINK';
        const color = winner === 'p1' ? '#9393D6' : '#CD62D5';

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
    }

    // Flash screen effect
    flashScreen() {
        document.body.classList.add('flash');
        setTimeout(() => document.body.classList.remove('flash'), 100);
    }
}
