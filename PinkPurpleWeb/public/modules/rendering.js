/**
 * Rendering Module (Chef d'orchestre)
 */

import { GAME_CONFIG, COLORS } from './constants.js';
import { ComboSystem } from './ComboSystem.js';
import { WorldRenderer } from './renderers/WorldRenderer.js';
import { PlayerRenderer } from './renderers/PlayerRenderer.js';
import { EffectRenderer } from './renderers/EffectRenderer.js';

export class Renderer {
    constructor(canvas, networkManager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.network = networkManager;
        this.scale = 1;
        this.animationId = null;

        // Sub-Renderers
        this.comboSystem = new ComboSystem();
        this.worldRenderer = new WorldRenderer(this.ctx);
        this.effectRenderer = new EffectRenderer(this.ctx, this.comboSystem);
        this.playerRenderer = new PlayerRenderer(this.ctx);

        // Camera / Zoom effects
        this.cameraZoom = 1.0;
        this.cameraFocus = { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
        this.targetZoom = 1.0;
        this.slowMotionFactor = 1.0;

        // Hit Impact
        this.hitStopTimer = 0;
        this.hitStopDuration = 0;
        this.frozenPlayers = null;
        this.frameCounter = 0;

        this.victoryAnimation = null;
        
        // Intro Sequence
        this.introState = {
            active: false,
            startTime: 0,
            duration: 2000
        };
        
        // Announcement
        this.announcement = null;

        this.setupCanvas();
    }

    setupCanvas() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.scale = Math.min(
            this.canvas.width / GAME_CONFIG.WIDTH,
            this.canvas.height / GAME_CONFIG.HEIGHT
        );
        this.worldRenderer.resize();
    }

    setObstacles(obstacles) {
        this.worldRenderer.setObstacles(obstacles);
    }

    playIntroSequence() {
        this.introState.active = true;
        this.introState.startTime = Date.now();
        this.cameraZoom = 0.5; // Start zoomed out far
        this.targetZoom = 1.0;
        
        // Sequence: "READY?" after 500ms, "FIGHT!" after 1500ms
        setTimeout(() => this.triggerAnnouncement("READY ?", "", 1000), 500);
        setTimeout(() => this.triggerAnnouncement("FIGHT !", "GO GO GO", 1000), 1500);
    }

    triggerAnnouncement(text, subtext, duration) {
        this.announcement = {
            text, subtext,
            startTime: Date.now(),
            duration
        };
    }

    // --- TRIGGERS ---

    triggerBounce(playerId) {
        this.playerRenderer.triggerAnimation(playerId, 'deformation', 300);
        
        const state = this.network.getState();
        const p = state.players[playerId];
        if (p) {
            for (let i = 0; i < 5; i++) {
                this.effectRenderer.addParticle(p.x, p.y, '#fff', 'spark');
            }
        }
    }

    triggerSwing(attackerId) {
        const state = this.network.getState();
        const attacker = state.players[attackerId];
        if (!attacker) return;

        this.playerRenderer.triggerAnimation(attackerId, 'bat_swing', 300, {
            distinct: true,
            direction: attacker.lastAction === 'UP' ? 'up' : (attacker.lastFacing === 1 ? 'right' : 'left')
        });
    }

    triggerHitEffect(attackerId, victimId, damage) {
        const state = this.network.getState();
        const attacker = state.players[attackerId];
        const victim = state.players[victimId];

        if (!attacker || !victim) return;

        this.frozenPlayers = JSON.parse(JSON.stringify(state.players));
        this.hitStopDuration = 90; // 1.5s
        this.hitStopTimer = this.hitStopDuration;

        this.cameraFocus = {
            x: (attacker.x + victim.x) / 2,
            y: (attacker.y + victim.y) / 2
        };
        this.cameraZoom = 2.0;
        this.slowMotionFactor = 0.05;

        const attackDirection = attacker.lastAction === 'UP' ? 'up' : 
                                (attacker.lastFacing === 1 ? 'right' : 'left');
        
        this.playerRenderer.triggerAnimation(attackerId, 'bat_swing', 4000, {
            distinct: true,
            direction: attackDirection
        });

        this.playerRenderer.triggerAnimation(victimId, 'stunned', 4000, {
            seed: Math.random(),
            isHit: true
        });

        const combo = this.comboSystem.recordHit(attackerId);
        if (combo.level >= 2) {
            this.effectRenderer.addFloatingText(attacker.x, attacker.y - 40, `${combo.count}x ${combo.name}`, combo.color);
        }

        this.effectRenderer.createHitParticles(victim.x, victim.y);
    }

    createExplosion(x, y, color) {
        this.effectRenderer.createExplosion(x, y, color);
    }

    addFloatingDamage(x, y, damage, color) {
        this.effectRenderer.addFloatingDamage(x, y, damage, color);
    }

    addFloatingText(x, y, text, color) {
        this.effectRenderer.addFloatingText(x, y, text, color);
    }

    addShake(intensity) {
        this.effectRenderer.addShake(intensity);
    }

    // --- MAIN LOOP ---

    draw() {
        const { players, scores, grenades, explosions } = this.network.getState();

        // Update logic
        const shake = this.effectRenderer.updateShake();
        this.playerRenderer.update(this.frameCounter);

        // Clear (TOUJOURS sans filter pour éviter les bugs de couleur)
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.filter = 'none'; // S'assurer que le clear n'est jamais affecté par un filter
        this.ctx.fillStyle = COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Hit Stop Logic
        let renderPlayers = players;
        let useInvertFilter = false;
        if (this.hitStopTimer > 0) {
            this.hitStopTimer--;
            if (this.frozenPlayers) renderPlayers = this.frozenPlayers;
            
            // Activer le filter seulement pour les 5 premières frames du hit stop
            if (this.hitStopTimer > this.hitStopDuration - 5) {
                useInvertFilter = true;
            }
            this.targetZoom = 2.5;
        } else {
            this.frameCounter++;
            this.frozenPlayers = null;
            this.targetZoom = 1.0;
            this.slowMotionFactor = 1.0;
        }
        
        // S'assurer que le filter est réinitialisé avant les transformations
        this.ctx.filter = 'none';

        // Camera Logic
        // Intro Override
        if (this.introState.active) {
            const elapsed = Date.now() - this.introState.startTime;
            if (elapsed < this.introState.duration) {
                // Easing cubic
                const t = elapsed / this.introState.duration;
                const ease = 1 - Math.pow(1 - t, 3); // Fast out, slow in
                
                // Zoom from 0.4 to 1.0
                this.cameraZoom = 0.4 + (0.6 * ease);
                
                // Focus: Start high up (0,0 implied or center) to current center
                // Force center focus during intro
                this.cameraFocus.x = GAME_CONFIG.WIDTH / 2;
                this.cameraFocus.y = GAME_CONFIG.HEIGHT / 2;
            } else {
                this.introState.active = false;
            }
        } else {
            // Normal Camera logic
            this.cameraZoom += (this.targetZoom - this.cameraZoom) * 0.1;
            if (this.cameraZoom < 1.1) {
                this.cameraFocus.x += (GAME_CONFIG.WIDTH / 2 - this.cameraFocus.x) * 0.1;
                this.cameraFocus.y += (GAME_CONFIG.HEIGHT / 2 - this.cameraFocus.y) * 0.1;
            }
        }

        // Transform
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const totalScale = this.scale * this.cameraZoom;
        const tx = centerX - (this.cameraFocus.x * totalScale) + shake.x;
        const ty = centerY - (this.cameraFocus.y * totalScale) + shake.y;

        this.ctx.setTransform(totalScale, 0, 0, totalScale, tx, ty);

        // DRAW LAYERS
        this.worldRenderer.drawBackground();
        this.worldRenderer.drawObstacles();
        this.worldRenderer.drawWalls();
        this.worldRenderer.drawFloor();
        
        this.playerRenderer.drawThreads(players); // Threads behind players? Or front?
        this.playerRenderer.drawWebs(players);
        
        // Appliquer le filter d'inversion uniquement aux joueurs pendant le hit stop
        // IMPORTANT: Toujours restaurer le filter après utilisation pour éviter les bugs sur tablette
        if (useInvertFilter) {
            this.ctx.save();
            this.ctx.filter = 'invert(1) contrast(2)';
            this.playerRenderer.drawPlayers(renderPlayers, this.network.getState());
            this.ctx.restore();
            // Double sécurité : forcer le filter à 'none' après restore
            this.ctx.filter = 'none';
        } else {
            // S'assurer que le filter est toujours 'none' même quand on ne l'utilise pas
            this.ctx.filter = 'none';
            this.playerRenderer.drawPlayers(renderPlayers, this.network.getState());
        }
        
        // Garantir que le filter est réinitialisé après le dessin des joueurs
        this.ctx.filter = 'none';
        
        this.drawGrenades(grenades); // Keep simple logic here or move to EffectRenderer? Keep simple for now.
        
        this.effectRenderer.drawExplosions(explosions);
        this.effectRenderer.drawParticles();
        this.drawScoreCircles(players, scores); // HUD should technically be screen space, but currently world space
        this.effectRenderer.drawFloatingMessages();
        
        this.comboSystem.update();
        this.effectRenderer.drawCombos(renderPlayers);
        
        // Announcement Overlay
        if (this.announcement) {
            const elapsed = Date.now() - this.announcement.startTime;
            const life = 1 - (elapsed / this.announcement.duration);
            if (life > 0) {
                this.effectRenderer.drawAnnouncement(this.announcement.text, this.announcement.subtext, life);
            } else {
                this.announcement = null;
            }
        }
        
        // CRITIQUE: Toujours réinitialiser le filter à la fin de chaque frame
        // Certaines tablettes Android peuvent avoir des bugs où le filter persiste
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.filter = 'none';

        // Victory Animation
        if (this.victoryAnimation) {
            const winner = players[this.victoryAnimation.player];
            if (winner) {
                const playing = this.effectRenderer.drawVictoryAnimation(winner.x, winner.y, winner.color, this.victoryAnimation.startTime);
                if (!playing) this.victoryAnimation = null;
            }
        }

        this.animationId = requestAnimationFrame(() => this.draw());
    }

    drawGrenades(grenades) {
        const ctx = this.ctx;
        for (const g of grenades) {
            ctx.save();
            ctx.shadowBlur = 15;
            ctx.shadowColor = COLORS.YELLOW;
            ctx.fillStyle = COLORS.YELLOW;
            ctx.beginPath();
            ctx.arc(g.x, g.y, GAME_CONFIG.GRENADE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    drawScoreCircles(players, scores) {
        // ... (Keep this logic here or move to UI overlay later) ...
        if (!scores) return;
        const ctx = this.ctx;
        const { WIDTH } = GAME_CONFIG;
        const names = this.network.getState().names || { p1: 'P1', p2: 'P2' };

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let p1Damage = players.p1 ? players.p1.damage : 0;
        let p1Grenades = players.p1 ? players.p1.grenadeCount : 0;
        let p2Damage = players.p2 ? players.p2.damage : 0;
        let p2Grenades = players.p2 ? players.p2.grenadeCount : 0;

        this.drawDamageCircle(250, 250, GAME_CONFIG.PLAYER1_COLOR, scores.p1 || 0, p1Damage, p1Grenades, names.p1);
        this.drawDamageCircle(WIDTH - 250, 250, GAME_CONFIG.PLAYER2_COLOR, scores.p2 || 0, p2Damage, p2Grenades, names.p2);
        ctx.restore();
    }

    drawDamageCircle(x, y, color, score, damage, grenadeCount, name) {
        const ctx = this.ctx;
        const radius = GAME_CONFIG.SCORE_CIRCLE_RADIUS;

        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.BLACK_TRANSPARENT; ctx.fill();

        const damagePercent = Math.min(damage, 100) / 100;
        if (damagePercent > 0) {
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * damagePercent));
            ctx.lineTo(x, y); ctx.fillStyle = COLORS.RED; ctx.fill();
        }

        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.shadowBlur = 30; ctx.shadowColor = color; ctx.stroke();
        
        ctx.font = "bold 80px Orbitron"; ctx.fillStyle = color; ctx.shadowBlur = 0; ctx.fillText(score, x, y);
        ctx.font = "bold 30px Orbitron"; ctx.fillStyle = "#ffffff"; ctx.shadowBlur = 10; ctx.fillText(name || "Player", x, y - 110);

        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(x - 30 + i * 30, y + 100, 10, 0, Math.PI * 2);
            ctx.fillStyle = i < grenadeCount ? 'red' : '#333';
            ctx.shadowBlur = i < grenadeCount ? 10 : 0;
            ctx.fill();
        }
    }

    start() { this.draw(); }
    stop() { if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; } }
}
