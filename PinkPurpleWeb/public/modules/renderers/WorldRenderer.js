import { GAME_CONFIG, COLORS } from '../constants.js';

export class WorldRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        this.obstaclesCanvas = document.createElement('canvas');
        this.obstaclesCtx = this.obstaclesCanvas.getContext('2d');
        this.metalBars = [];
        this.resize();
    }

    resize() {
        this.obstaclesCanvas.width = GAME_CONFIG.WIDTH;
        this.obstaclesCanvas.height = GAME_CONFIG.HEIGHT;
        this.preRenderObstacles();
    }

    setObstacles(obstacles) {
        this.metalBars = obstacles.map(o => ({
            ...o,
            angle: 0,
            color: `rgba(${100 + Math.random() * 50}, ${100 + Math.random() * 50}, ${110 + Math.random() * 50}, 0.8)`
        }));
        this.preRenderObstacles();
    }

    preRenderObstacles() {
        const ctx = this.obstaclesCtx;
        ctx.clearRect(0, 0, this.obstaclesCanvas.width, this.obstaclesCanvas.height);

        for (const bar of this.metalBars) {
            ctx.save();
            ctx.translate(bar.x, bar.y);
            
            // --- 3D EXTRUSION (Fake Depth) ---
            // On dessine un bloc décalé derrière en noir pour donner l'impression de volume
            const depth = 15;
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.moveTo(0, 0); // Top-Left
            ctx.lineTo(bar.w, 0); // Top-Right
            ctx.lineTo(bar.w + depth, depth); // Top-Right Depth
            ctx.lineTo(bar.w + depth, bar.h + depth); // Bottom-Right Depth
            ctx.lineTo(depth, bar.h + depth); // Bottom-Left Depth
            ctx.lineTo(0, bar.h); // Bottom-Left
            ctx.closePath();
            ctx.fill();

            // --- FACE AVANT ---
            ctx.rotate(bar.angle);

            // 1. Fond solide (Darker)
            ctx.fillStyle = 'rgba(10, 10, 20, 1.0)'; // Opaque pour cacher l'arrière
            ctx.fillRect(0, 0, bar.w, bar.h);

            // 2. Grille Hachurée interne (CONTRASTÉE)
            ctx.save();
            ctx.beginPath();
            ctx.rect(0,0,bar.w,bar.h);
            ctx.clip();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // Plus visible
            ctx.lineWidth = 2;
            ctx.beginPath();
            // Rayures diagonales
            for(let i=-bar.h; i<bar.w + bar.h; i+=15) {
                ctx.moveTo(i, 0);
                ctx.lineTo(i+bar.h, bar.h);
            }
            ctx.stroke();
            ctx.restore();

            // 3. Contour Néon Interne
            ctx.shadowBlur = 10;
            ctx.shadowColor = bar.color;
            ctx.strokeStyle = bar.color;
            ctx.lineWidth = 3;
            ctx.strokeRect(0, 0, bar.w, bar.h);

            // 4. Contour Noir Épais (Cel Shading)
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, bar.w, bar.h);

            // 5. Highlight Edge (Coin haut gauche) - Style "Reflet plastique"
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(bar.w - 5, 2);
            ctx.lineTo(2, 2);
            ctx.lineTo(2, bar.h - 5);
            ctx.stroke();

            ctx.restore();
        }
    }

    drawBackground() {
        const ctx = this.ctx;
        const { WIDTH, HEIGHT } = GAME_CONFIG;

        ctx.save();
        ctx.lineWidth = 3; // Ligne plus épaisse pour le style BD
        ctx.strokeStyle = COLORS.GRID; // Couleur grille existante (magenta foncé ?)
        
        // On force un cyan sombre pour la grille retro
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)'; 

        const horizonY = HEIGHT / 2;
        const centerX = WIDTH / 2;

        // TINTED SURFACE (Sol teinté)
        // Dégradé pour donner de la profondeur sans perdre transparence
        const floorGradient = ctx.createLinearGradient(0, horizonY, 0, HEIGHT);
        floorGradient.addColorStop(0, 'rgba(20, 0, 40, 0.8)'); // Horizon sombre
        floorGradient.addColorStop(1, 'rgba(40, 0, 60, 0.2)'); // Bas plus clair/transparent
        ctx.fillStyle = floorGradient;
        ctx.fillRect(0, horizonY, WIDTH, HEIGHT - horizonY);

        // Perspective grid
        ctx.beginPath();
        for (let i = -10; i <= 10; i++) {
            ctx.moveTo(centerX + i * 50, horizonY + 50);
            ctx.lineTo(centerX + i * 400, HEIGHT);
        }
        ctx.stroke();

        ctx.beginPath();
        // Ceiling grid (mirrored)
        for (let i = -10; i <= 10; i++) {
            ctx.moveTo(centerX + i * 50, horizonY - 50);
            ctx.lineTo(centerX + i * 400, 0);
        }
        ctx.stroke();

        // Horizontal lines with animation
        const timeOffset = (Date.now() / 50) % 100;
        ctx.beginPath();
        for (let y = horizonY + 50; y < HEIGHT; y += 80) {
            const lineY = y + timeOffset;
            if (lineY < HEIGHT) {
                ctx.moveTo(0, lineY);
                ctx.lineTo(WIDTH, lineY);
            }
        }
        ctx.stroke();

        ctx.beginPath();
        for (let y = horizonY - 50; y > 0; y -= 80) {
             const lineY = y - timeOffset;
             if (lineY > 0) {
                ctx.moveTo(0, lineY);
                ctx.lineTo(WIDTH, lineY);
             }
        }
        ctx.stroke();

        // Glow zones (Vignette)
        ctx.shadowBlur = 0;
        const vignette = ctx.createRadialGradient(centerX, horizonY, HEIGHT/4, centerX, horizonY, HEIGHT);
        vignette.addColorStop(0, 'transparent');
        vignette.addColorStop(1, 'rgba(0,0,0,0.6)'); // Coins sombres style BD
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.restore();
    }

    drawObstacles() {
        this.ctx.save();
        this.ctx.drawImage(this.obstaclesCanvas, 0, 0);
        this.ctx.restore();
    }

    drawFloor() {
        const ctx = this.ctx;
        const { WIDTH, HEIGHT } = GAME_CONFIG;

        ctx.strokeStyle = COLORS.CYAN;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.CYAN;
        ctx.beginPath();
        ctx.moveTo(0, HEIGHT - 40);
        ctx.lineTo(WIDTH, HEIGHT - 40);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    drawWalls() {
        const ctx = this.ctx;
        const { WIDTH, HEIGHT } = GAME_CONFIG;
        const WALL_THICKNESS = 10; // Plus épais

        // Mur gauche
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // Fond rouge léger
        
        // Hachures Danger
        const stripePattern = ctx.createLinearGradient(0, 0, 20, 20);
        stripePattern.addColorStop(0, 'rgba(255, 0, 0, 0.5)');
        stripePattern.addColorStop(0.5, 'rgba(255, 0, 0, 0.5)');
        stripePattern.addColorStop(0.5, 'transparent');
        stripePattern.addColorStop(1, 'transparent');
        
        // Draw Left Wall
        ctx.fillRect(0, 0, WALL_THICKNESS, HEIGHT);
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(WALL_THICKNESS, 0); ctx.lineTo(WALL_THICKNESS, HEIGHT); ctx.stroke(); // Ligne rouge

        // Draw Right Wall
        ctx.fillRect(WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, HEIGHT);
        ctx.beginPath(); ctx.moveTo(WIDTH - WALL_THICKNESS, 0); ctx.lineTo(WIDTH - WALL_THICKNESS, HEIGHT); ctx.stroke();

        ctx.restore();
    }
}

