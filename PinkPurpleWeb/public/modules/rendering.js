/**
 * Rendering Module
 * Handles all canvas drawing operations
 */

import { GAME_CONFIG, COLORS } from './constants.js';
import { Projection3D } from './animations/Projection3D.js';
import { ComboSystem } from './ComboSystem.js';

export class Renderer {
    constructor(canvas, networkManager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.network = networkManager;
        this.scale = 1;
        this.particles = [];
        this.shakeIntensity = 0;
        this.trails = {};
        this.metalBars = [];
        this.animationId = null;
        this.floatingMessages = [];

        // Hit Impact & Animation
        this.hitStopTimer = 0;
        this.hitStopDuration = 0;
        this.playerAnims = {};
        this.frameCounter = 0;

        // Camera / Zoom effects
        this.cameraZoom = 1.0;
        this.cameraFocus = { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
        this.targetZoom = 1.0;
        this.slowMotionFactor = 1.0;

        // Optimization: Off-screen canvas for obstacles
        this.obstaclesCanvas = document.createElement('canvas');
        this.obstaclesCtx = this.obstaclesCanvas.getContext('2d');

        // Système de projection 3D pour calculer les positions
        this.projection3D = new Projection3D();
        
        // Système de combo original
        this.comboSystem = new ComboSystem();

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

        // Resize cache canvas
        this.obstaclesCanvas.width = GAME_CONFIG.WIDTH;
        this.obstaclesCanvas.height = GAME_CONFIG.HEIGHT;
        this.preRenderObstacles();

        // Resize Zdog (utilise canvas offscreen à taille fixe du jeu)
        if (this.player3DRenderer) {
            this.player3DRenderer.resize(this.scale);
        }
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
            ctx.rotate(bar.angle);

            // Glass effect
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.strokeStyle = bar.color;
            ctx.lineWidth = 2;

            // Neon Glow
            ctx.shadowBlur = 20;
            ctx.shadowColor = bar.color;

            ctx.fillRect(0, 0, bar.w, bar.h);
            ctx.strokeRect(0, 0, bar.w, bar.h);

            // Subtle reflection
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(0, bar.h);
            ctx.lineTo(bar.w, 0);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }
    }

    triggerBounce(playerId) {
        // Impact squash animation
        this.playerAnims[playerId] = {
            type: 'deformation', // Reuse deformation logic
            startTime: Date.now(),
            duration: 300, // Quick bounce squash 
            seed: Math.random()
        };
        
        // Déclencher animation Zdog
        // Animation bounce gérée directement dans drawPlayerModel
        // L'animation est déjà déclenchée via playerAnims

        // Add a few particles
        const state = this.network.getState();
        const p = state.players[playerId];
        if (p) {
            for (let i = 0; i < 5; i++) {
                this.particles.push({
                    x: p.x, y: p.y,
                    vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
                    life: 0.5, color: '#fff', type: 'spark'
                });
            }
        }
    }

    triggerSwing(attackerId) {
        const state = this.network.getState();
        const attacker = state.players[attackerId];
        if (!attacker) return;

        // Fast swing for misses (Real-time speed ~300ms)
        this.playerAnims[attackerId] = {
            type: 'bat_swing',
            startTime: Date.now(),
            duration: 300,
            distinct: true
        };

        // Animation swing gérée par playerAnims
    }

    triggerHitEffect(attackerId, victimId, damage) {
        const state = this.network.getState();
        const attacker = state.players[attackerId];
        const victim = state.players[victimId];

        if (!attacker || !victim) return;

        // Cache frozen state for rendering during HitStop
        this.frozenPlayers = JSON.parse(JSON.stringify(state.players));

        // 1. FREEZE FRAME (Arrêt sur image) - Increased to 1.5s as requested
        this.hitStopDuration = 90; // 90 frames = 1.5s
        this.hitStopTimer = this.hitStopDuration;

        // 2. ZOOM on Action
        this.cameraFocus = {
            x: (attacker.x + victim.x) / 2,
            y: (attacker.y + victim.y) / 2
        };
        this.cameraZoom = 2.0;

        // 3. Slow Motion setup (Matrix Style)
        this.slowMotionFactor = 0.05; // 5% speed (Very slow)

        // 4. ANIMATION DATA (Distinct Frames)
        // Déterminer la direction de l'attaque basée sur lastAction
        const attackDirection = attacker.lastAction === 'UP' ? 'up' : 
                                (attacker.lastFacing === 1 ? 'right' : 'left');
        
        this.playerAnims[attackerId] = {
            type: 'bat_swing',
            startTime: Date.now(),
            duration: 4000,
            distinct: true,
            direction: attackDirection // Stocker la direction
        };

        this.playerAnims[victimId] = {
            type: 'stunned',
            startTime: Date.now(),
            duration: 4000,
            seed: Math.random(),
            isHit: true
        };

        // Animations gérées par playerAnims (swing pour attaquant, stunned pour victime)
        
        // 5. COMBO SYSTEM - Enregistrer le hit pour le combo
        const combo = this.comboSystem.recordHit(attackerId);
        if (combo.level >= 2) {
            // Afficher l'effet de combo
            this.addFloatingText(
                attacker.x, 
                attacker.y - 40, 
                `${combo.count}x ${combo.name}`, 
                combo.color
            );
        }

        // 6. Particles
        if (victim) {
            for (let i = 0; i < 40; i++) {
                this.particles.push({
                    x: victim.x,
                    y: victim.y,
                    vx: (Math.random() - 0.5) * 40,
                    vy: (Math.random() - 0.5) * 40,
                    life: 2.0,
                    color: i % 2 === 0 ? '#ff0044' : '#fff', // White hot
                    type: 'spark'
                });
            }
        }
    }

    createExplosion(x, y, color) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: color
            });
        }
        this.shakeIntensity = 20;
    }

    addShake(intensity) {
        this.shakeIntensity = intensity;
    }

    // Main draw loop
    draw() {
        const { players, scores, grenades, explosions } = this.network.getState();

        // Shake decay
        if (this.shakeIntensity > 0) {
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
        }

        const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
        const shakeY = (Math.random() - 0.5) * this.shakeIntensity;

        // Clear screen ALWAYS
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Hit Stop / Slow Motion Logic
        let renderPlayers = players; // Default to live state

        if (this.hitStopTimer > 0) {
            this.hitStopTimer--;

            // USE FROZEN STATE during HitStop
            if (this.frozenPlayers) {
                renderPlayers = this.frozenPlayers;
            }

            // Invert flash at start (Impact)
            if (this.hitStopTimer > this.hitStopDuration - 5) {
                this.ctx.filter = 'invert(1) contrast(2)';
            } else {
                this.ctx.filter = 'none';
            }

            // While frozen, keep zoom tight
            this.targetZoom = 2.5;

        } else {
            // Resume speed
            this.ctx.filter = 'none';
            this.frameCounter++;
            this.frozenPlayers = null; // Clear freeze cache

            // Smoothly zoom out
            this.targetZoom = 1.0;
            this.slowMotionFactor = 1.0;
        }

        // Smooth Camera Zoom
        this.cameraZoom += (this.targetZoom - this.cameraZoom) * 0.1;

        // If zooming out, drift focus back to center
        if (this.cameraZoom < 1.1) {
            this.cameraFocus.x += (GAME_CONFIG.WIDTH / 2 - this.cameraFocus.x) * 0.1;
            this.cameraFocus.y += (GAME_CONFIG.HEIGHT / 2 - this.cameraFocus.y) * 0.1;
        }

        // Apply Transform: Center on cameraFocus with Zoom
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // Calculate partial scale including screen fit scale
        const totalScale = this.scale * this.cameraZoom;

        // Translate to focus point, scale, untranslate to screen center
        const tx = centerX - (this.cameraFocus.x * totalScale) + shakeX;
        const ty = centerY - (this.cameraFocus.y * totalScale) + shakeY;

        this.ctx.setTransform(totalScale, 0, 0, totalScale, tx, ty);

        this.drawBackground();
        this.drawObstacles();
        this.drawFloor();
        this.drawPlayers(renderPlayers);
        this.drawGrenades(grenades);
        this.drawExplosions(explosions);
        this.drawParticles();
        this.drawScoreCircles(players, scores);
        this.drawFloatingMessages();
        
        // Mettre à jour le système de combo
        this.comboSystem.update();
        
        // Afficher les combos actifs
        this.drawCombos(renderPlayers);
        
        // Mettre à jour le système de combo
        this.comboSystem.update();
        
        // Afficher les combos actifs
        this.drawCombos(renderPlayers);

        this.animationId = requestAnimationFrame(() => this.draw());
    }

    drawBackground() {
        const ctx = this.ctx;
        const { WIDTH, HEIGHT } = GAME_CONFIG;

        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLORS.GRID;
        const horizonY = HEIGHT / 2;
        const centerX = WIDTH / 2;

        // Perspective grid
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

        // Horizontal lines with animation
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

        // Glow zones
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'cyan';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.fillRect(0, HEIGHT - 100, WIDTH, 100);
        ctx.fillRect(0, 0, WIDTH, 100);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    drawObstacles() {
        const ctx = this.ctx;
        ctx.save();
        ctx.drawImage(this.obstaclesCanvas, 0, 0);
        ctx.restore();
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

    drawPlayers(players) {
        const ctx = this.ctx;

        for (const id in players) {
            const p = players[id];

            // Update trail
            if (!this.trails[id]) this.trails[id] = [];
            this.trails[id].push({ x: p.x, y: p.y });
            if (this.trails[id].length > GAME_CONFIG.TRAIL_LENGTH) {
                this.trails[id].shift();
            }

            // Draw trail (2D - reste sur le canvas principal)
            ctx.save();
            ctx.beginPath();
            if (this.trails[id].length > 0) {
                ctx.moveTo(this.trails[id][0].x, this.trails[id][0].y);
                for (let i = 1; i < this.trails[id].length; i++) {
                    ctx.lineTo(this.trails[id][i].x, this.trails[id][i].y);
                }
            }
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.4;
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.stroke();
            ctx.restore();

            // Rendu avec calculs 3D (utilise Projection3D pour les positions)
            this.drawPlayerModel(this.ctx, p, id);
        }
    }

    drawPlayerModel(ctx, p, id) {
        ctx.save();
        ctx.translate(p.x, p.y);

        const anim = this.playerAnims[id];
        
        // Vérifier si le joueur est stunned (pour les yeux jaunes)
        // IMPORTANT: Seule la VICTIME a les yeux en spirale (animation stunned)
        // L'ATTAQUANT a l'animation bat_swing et victoryStance, PAS stunned
        // On ne vérifie QUE l'animation stunned, pas isHit (car l'attaquant a aussi isHit=true temporairement)
        const isStunned = (anim && anim.type === 'stunned');

        // COMIC HIT EFFECT (POW!) - Replaces victim body during impact freeze
        if (anim && (anim.type === 'deformation' || anim.type === 'stunned') && anim.isHit && this.hitStopTimer > 0) {
            ctx.fillStyle = '#ffffff'; // White blast
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ffff00'; // Yellow glow

            // Draw Spiky Star
            ctx.beginPath();
            const spikes = 12;
            const outer = 60;
            const inner = 30;
            for (let i = 0; i < spikes * 2; i++) {
                const r = (i % 2 === 0) ? outer : inner;
                const a = (Math.PI * i) / spikes;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();

            // Draw Text
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 30px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('POW!', 0, 0);

            ctx.restore();
            return; // HIDE ADVERSARY
        }

        // --- 1. SQUASH & STRETCH (Velocity Based) ---
        // Calculate velocity from trails if available, or fake it
        let vx = 0, vy = 0;
        if (this.trails[id] && this.trails[id].length > 1) {
            const last = this.trails[id][this.trails[id].length - 1];
            // Simple velocity estimate
            vx = (p.x - last.x) * 5;
            vy = (p.y - last.y) * 5;
        }

        let stretch = Math.min(Math.sqrt(vx * vx + vy * vy) * 0.02, 0.3);
        let angle = Math.atan2(vy, vx);

        // Hit Deformation Override
        let isGlitching = false;
        if (anim && anim.type === 'deformation') {
            const elapsed = Date.now() - anim.startTime;
            if (elapsed < anim.duration) {
                const progress = elapsed / anim.duration;
                const intensity = (1 - progress);
                // Jelly wobble (Visible intensity)
                stretch = Math.sin(progress * Math.PI * 10) * intensity * 0.25;
                angle = Math.PI / 2; // Vertical squash
                if (Math.random() < 0.2 * intensity) isGlitching = true;
            } else {
                delete this.playerAnims[id];
            }
        }

        // --- 2. NEON BODY ---
        const r = GAME_CONFIG.PLAYER_RADIUS;
        
        // Pas de masquage - on laisse tout visible pour que la batte soit complète
        // Le masquage 3D sera géré différemment si nécessaire
        
        ctx.rotate(angle);
        ctx.scale(1 + stretch, 1 - stretch);
        ctx.rotate(-angle);

        // VICTORY STANCE: Change color to GOLD
        const bodyColor = p.victoryStance ? '#ffd700' : p.color; // Or (#ffd700) en pose victoire
        const glowColor = p.victoryStance ? '#ffd700' : p.color;

        // Disable shadow for Fill to prevent "Black Box" artifact
        ctx.shadowBlur = 0;

        // Fill (Glassy) - Plus visible en or
        ctx.fillStyle = bodyColor;
        ctx.globalAlpha = p.victoryStance ? 0.4 : 0.2; // Plus opaque en or pour meilleure visibilité
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1.0;

        // Stroke (Neon Tube)
        ctx.lineWidth = 3;
        // White core with colored glow gives best Neon effect
        ctx.strokeStyle = isGlitching ? '#ffffff' : '#ffffff';
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = p.victoryStance ? 30 : 20; // Glow plus fort en or
        ctx.stroke();

        // Overlay color stroke for definition - Plus épais en or
        ctx.shadowBlur = 0;
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = p.victoryStance ? 2 : 1; // Ligne plus épaisse en or
        ctx.stroke();

        // --- 3. PROCEDURAL FACE (Eye Tracking) - Placement logique selon direction ---
        const facing = p.facing || 1;
        const state = this.network.getState();
        const opponentId = id === 'p1' ? 'p2' : 'p1';
        const opponent = state.players && state.players[opponentId]; // Safe check

        // Placement des yeux selon la direction (rotation de la sphère en 2D)
        // Quand facing = 1 (droite), yeux à droite, quand facing = -1 (gauche), yeux à gauche
        let eyeOffsetX = 0;
        if (facing === 1) {
            eyeOffsetX = 3; // Yeux décalés vers la droite
        } else {
            eyeOffsetX = -3; // Yeux décalés vers la gauche
        }
        
        let lookX = 0, lookY = 0;
        if (opponent) {
            const dx = opponent.x - p.x;
            const dy = opponent.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            lookX = (dx / dist) * 8;
            lookY = (dy / dist) * 8;
        }

        // Victory Laugh Shake
        if (p.victoryStance) {
            const shake = Math.sin(Date.now() / 50) * 3;
            ctx.translate(0, shake);
        }

        // Eyes Group
        ctx.save();
        // Expression logic
        let eyeScaleY = 1;
        let eyeColor = '#fff';

        if (p.victoryStance) {
            // Happy Eyes (^ ^)
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.shadowBlur = 5;

            // Left Eye ^
            ctx.beginPath();
            ctx.moveTo(-20, -5);
            ctx.lineTo(-15, -10);
            ctx.lineTo(-10, -5);
            ctx.stroke();

            // Right Eye ^
            ctx.beginPath();
            ctx.moveTo(10, -5);
            ctx.lineTo(15, -10);
            ctx.lineTo(20, -5);
            ctx.stroke();

            eyeScaleY = 0; // Cancel standard eyes

        } else if (isStunned) {
            // Spiral Eyes (Spiral) - JAUNE pour TOUS les joueurs stunned
            ctx.strokeStyle = '#ffff00'; // Jaune au lieu de blanc
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2;
            const time = Date.now() / 100;

            // Left Spiral
            ctx.beginPath();
            for (let i = 0; i < 3.5; i += 0.2) {
                const r = i * 2;
                const a = i * 4 + time;
                // Start from center
                const x = -15 + Math.cos(a) * r;
                const y = -5 + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Right Spiral
            ctx.beginPath();
            for (let i = 0; i < 3.5; i += 0.2) {
                const r = i * 2;
                const a = i * 4 + time;
                const x = 15 + Math.cos(a) * r;
                const y = -5 + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset shadow

            eyeScaleY = 0; // Cancel standard eyes

        } else if (anim && anim.type === 'bat_swing') {
            // Yeux concentrés/agressifs pendant l'attaque
            const direction = anim.direction || (facing === 1 ? 'right' : 'left');
            if (direction === 'up') {
                eyeScaleY = 0.6; // Yeux plus ronds pour l'attaque vers le haut
                lookY -= 3; // Regarder vers le haut
            } else {
                eyeScaleY = 0.4; // Yeux plus étroits pour attaque horizontale
                lookX += 2 * facing; // Regarder dans la direction de l'attaque
            }
        } else if (p.isHit) {
            // Shocked/Dead eyes
            eyeScaleY = 2.0;
            lookX = (Math.random() - 0.5) * 10;
            lookY = (Math.random() - 0.5) * 10;
        }

        // Standard Eyes Drawing - Placement logique selon direction
        if (eyeScaleY > 0) {
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';

            // Position des yeux avec offset selon direction + tracking
            const leftEyeX = -15 + eyeOffsetX + lookX * 0.3;
            const rightEyeX = 15 + eyeOffsetX + lookX * 0.3;
            const eyeY = -5 + lookY * 0.3;
            
            // Left Eye
            ctx.beginPath();
            ctx.ellipse(leftEyeX, eyeY, 6, 6 * eyeScaleY, 0, 0, Math.PI * 2);
            ctx.fill();

            // Right Eye
            ctx.beginPath();
            ctx.ellipse(rightEyeX, eyeY, 6, 6 * eyeScaleY, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();


        // --- 4. FLOATING HANDS (avec calculs 3D) ---
        // Calculate hand positions en 3D puis projection
        // facing déjà déclaré plus haut
        const time = Date.now() / 200;

        // Idle/float offset
        const flY = Math.sin(time) * 5;

        // Hand positions 3D relatives au centre du corps
        // On utilise des coordonnées 3D pour avoir une meilleure rotation
        let h1x3D = 25 * facing, h1y3D = 10 + flY, h1z3D = 0; // Weapon hand
        let h2x3D = -20 * facing, h2y3D = 10 + flY, h2z3D = 0; // Back hand

        let batRotation = -Math.PI / 4 * facing; // Idle bat pos
        let bodyRotationZ = 0; // Rotation du corps pour les animations

        // ANIMATION OVERRIDE avec 3 directions distinctes
        if (anim && anim.type === 'bat_swing') {
            const elapsed = Date.now() - anim.startTime;
            if (elapsed < anim.duration) {
                const progress = elapsed / anim.duration;
                const direction = anim.direction || (facing === 1 ? 'right' : 'left');
                
                if (direction === 'up') {
                    // === ATTAQUE VERS LE HAUT : CERCLE COMPLET ===
                    if (progress < 0.25) {
                        // Wind up : descendre la batte
                        const t = progress / 0.25;
                        h1x3D = 25 * facing;
                        h1y3D = 30 - 25 * t; // Descend de 30 à 5
                        h1z3D = -10 * t; // Recule en 3D
                        batRotation = (3 * Math.PI / 2) - (t * Math.PI / 2); // De 270° à 180°
                        bodyRotationZ = -0.2 * t; // Légère rotation du corps
                    } else if (progress < 0.5) {
                        // SMASH : Cercle complet MAGNIFIQUE de bas en haut
                        const t = (progress - 0.25) / 0.25;
                        const swing = 1 - Math.pow(1 - t, 3); // Easing cubique
                        const angle = Math.PI + (swing * Math.PI * 2); // De 180° à 540° (cercle complet)
                        const radius = 60; // Rayon plus grand pour effet plus spectaculaire
                        
                        // Position 3D avec mouvement circulaire fluide
                        h1x3D = (25 * facing) + radius * Math.cos(angle) * facing;
                        h1y3D = 10 + radius * Math.sin(angle);
                        h1z3D = -15 + (swing * 30); // Avance en 3D de manière plus prononcée
                        batRotation = angle;
                        bodyRotationZ = -0.3 + (0.6 * swing); // Rotation du corps plus prononcée
                        
                        // Motion Swipe amélioré avec effet de traînée
                        ctx.save();
                        // Traînée principale
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                        ctx.lineWidth = 60;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.arc(0, 0, radius, Math.PI, Math.PI + (swing * Math.PI * 2), false);
                        ctx.stroke();
                        
                        // Traînée secondaire (plus fine, plus transparente)
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.lineWidth = 40;
                        ctx.beginPath();
                        ctx.arc(0, 0, radius + 10, Math.PI, Math.PI + (swing * Math.PI * 2), false);
                        ctx.stroke();
                        
                        // Particules d'énergie au point d'impact
                        if (swing > 0.7) {
                            const particleCount = Math.floor((swing - 0.7) * 10);
                            for (let i = 0; i < particleCount; i++) {
                                const pAngle = angle + (Math.random() - 0.5) * 0.5;
                                const pDist = radius + Math.random() * 20;
                                ctx.fillStyle = `rgba(255, 255, 255, ${0.8 - swing})`;
                                ctx.beginPath();
                                ctx.arc(
                                    Math.cos(pAngle) * pDist * facing,
                                    Math.sin(pAngle) * pDist,
                                    3, 0, Math.PI * 2
                                );
                                ctx.fill();
                            }
                        }
                        ctx.restore();
                    } else {
                        // Recovery
                        const t = (progress - 0.5) / 0.5;
                        h1x3D = 25 * facing;
                        h1y3D = 10 + (5 * (1 - t));
                        h1z3D = 10 * (1 - t);
                        batRotation = (-Math.PI / 4) * facing;
                        bodyRotationZ = 0.2 * (1 - t);
                    }
                } else if (direction === 'right' || (direction === 'left' && facing === 1)) {
                    // === ATTAQUE VERS LA DROITE : DEMI-CERCLE ===
                    if (progress < 0.25) {
                        // Wind up : reculer
                        const t = progress / 0.25;
                        h1x3D = (25 - 20 * t) * facing;
                        h1y3D = 10 - 10 * t;
                        h1z3D = -5 * t;
                        batRotation = (-Math.PI / 4 - Math.PI / 2 * t) * facing;
                    } else if (progress < 0.4) {
                        // SMASH : demi-cercle de gauche à droite
                        const t = (progress - 0.25) / 0.15;
                        const swing = 1 - Math.pow(1 - t, 3);
                        const startAngle = -Math.PI / 2;
                        const endAngle = Math.PI / 2;
                        const angle = startAngle + (swing * (endAngle - startAngle));
                        const radius = 70;
                        h1x3D = radius * Math.cos(angle) * facing;
                        h1y3D = radius * Math.sin(angle);
                        h1z3D = -5 + (swing * 10);
                        batRotation = (angle + Math.PI / 2) * facing;
                        
                        // Motion Swipe
                        ctx.save();
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                        ctx.lineWidth = 40;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.arc(0, 0, radius, startAngle, angle, false);
                        ctx.stroke();
                        ctx.restore();
                    } else if (progress < 0.6) {
                        // HOLD
                        h1x3D = 40 * facing;
                        h1y3D = 0;
                        h1z3D = 5;
                        batRotation = Math.PI / 2 * facing;
                        // Shockwave
                        const h1ProjTemp = this.projection3D.project(h1x3D, h1y3D, h1z3D);
                        ctx.save();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(h1ProjTemp.x, h1ProjTemp.y, 50 + ((progress - 0.4) / 0.2) * 200, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.restore();
                    } else {
                        // Recover
                        const t = (progress - 0.6) / 0.4;
                        h1x3D = (25 + 15 * (1 - t)) * facing;
                        h1y3D = 10 * (1 - t);
                        h1z3D = 5 * (1 - t);
                        batRotation = (-Math.PI / 4) * facing;
                    }
                } else {
                    // === ATTAQUE VERS LA GAUCHE : DEMI-CERCLE SYMÉTRIQUE ===
                    if (progress < 0.25) {
                        // Wind up : reculer (symétrique)
                        const t = progress / 0.25;
                        h1x3D = (-25 + 20 * t) * facing; // Inverse de right
                        h1y3D = 10 - 10 * t;
                        h1z3D = -5 * t;
                        batRotation = (-Math.PI / 4 + Math.PI / 2 * t) * facing; // Inverse
                    } else if (progress < 0.4) {
                        // SMASH : demi-cercle de droite à gauche
                        const t = (progress - 0.25) / 0.15;
                        const swing = 1 - Math.pow(1 - t, 3);
                        const startAngle = Math.PI / 2;
                        const endAngle = -Math.PI / 2;
                        const angle = startAngle + (swing * (endAngle - startAngle));
                        const radius = 70;
                        h1x3D = radius * Math.cos(angle) * facing;
                        h1y3D = radius * Math.sin(angle);
                        h1z3D = -5 + (swing * 10);
                        batRotation = (angle - Math.PI / 2) * facing; // Inverse
                        
                        // Motion Swipe (symétrique)
                        ctx.save();
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                        ctx.lineWidth = 40;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.arc(0, 0, radius, startAngle, angle, true); // Sens inverse
                        ctx.stroke();
                        ctx.restore();
                    } else if (progress < 0.6) {
                        // HOLD
                        h1x3D = -40 * facing;
                        h1y3D = 0;
                        h1z3D = 5;
                        batRotation = -Math.PI / 2 * facing;
                        // Shockwave
                        const h1ProjTemp = this.projection3D.project(h1x3D, h1y3D, h1z3D);
                        ctx.save();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(h1ProjTemp.x, h1ProjTemp.y, 50 + ((progress - 0.4) / 0.2) * 200, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.restore();
                    } else {
                        // Recover
                        const t = (progress - 0.6) / 0.4;
                        h1x3D = (-25 - 15 * (1 - t)) * facing;
                        h1y3D = 10 * (1 - t);
                        h1z3D = 5 * (1 - t);
                        batRotation = (-Math.PI / 4) * facing;
                    }
                }
            } else {
                delete this.playerAnims[id];
            }
        }
        
        // Appliquer rotation du corps si nécessaire
        if (bodyRotationZ !== 0) {
            ctx.rotate(bodyRotationZ);
        }

        // Projection 3D -> 2D pour les mains
        const h1Proj = this.projection3D.project(h1x3D, h1y3D, h1z3D);
        const h2Proj = this.projection3D.project(h2x3D, h2y3D, h2z3D);

        // Draw Hands
        ctx.fillStyle = p.color; // Solid neon color
        ctx.shadowBlur = 15;

        // Back Hand (projetée)
        ctx.beginPath();
        ctx.arc(h2Proj.x, h2Proj.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Front Hand (Weapon Hand) - projetée
        ctx.save();
        ctx.translate(h1Proj.x, h1Proj.y);
        ctx.rotate(batRotation);

        // BAT
        ctx.fillStyle = '#eee'; // White-ish neon bat
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;

        // Handle
        ctx.fillRect(-2, -5, 15, 6); // Hand grip area
        // Bat body
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(80, -10);
        ctx.quadraticCurveTo(90, -5, 90, 0); // Tip rounded
        ctx.quadraticCurveTo(90, 5, 80, 10);
        ctx.lineTo(10, 5);
        ctx.fill();

        // Hand circle on top of bat handle - Or en victory stance
        ctx.fillStyle = p.victoryStance ? '#ffd700' : p.color;
        ctx.shadowColor = p.victoryStance ? '#ffd700' : p.color;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore(); // End Hand/Bat transform

        ctx.restore(); // End Player transform
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
            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }

    drawExplosions(explosions) {
        const ctx = this.ctx;

        for (let i = explosions.length - 1; i >= 0; i--) {
            const exp = explosions[i];
            exp.age += 0.05;

            ctx.save();
            ctx.globalAlpha = 1 - exp.age;
            ctx.shadowBlur = 30;
            ctx.shadowColor = COLORS.YELLOW;
            ctx.strokeStyle = COLORS.YELLOW;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(exp.x, exp.y, exp.radius * exp.age, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            if (exp.age >= 1) {
                explosions.splice(i, 1);
            }
        }
    }

    drawCombos(players) {
        const ctx = this.ctx;
        
        for (const [id, p] of Object.entries(players)) {
            const combo = this.comboSystem.getCombo(id);
            if (combo && combo.level >= 2) {
                // Afficher l'indicateur de combo au-dessus du joueur
                const time = Date.now() / 200;
                const pulse = 1 + Math.sin(time) * 0.2;
                
                ctx.save();
                ctx.translate(p.x, p.y - 50);
                
                // Glow du combo
                ctx.shadowBlur = 20 * pulse;
                ctx.shadowColor = combo.color;
                ctx.fillStyle = combo.color;
                ctx.font = `bold ${20 + combo.level * 5}px Orbitron`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${combo.count}x ${combo.name}`, 0, 0);
                
                // Particules autour du combo
                for (let i = 0; i < combo.level * 2; i++) {
                    const angle = (time * 2 + (i / combo.level) * Math.PI * 2) % (Math.PI * 2);
                    const dist = 30 + Math.sin(time * 3 + i) * 10;
                    ctx.fillStyle = combo.color;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.arc(
                        Math.cos(angle) * dist,
                        Math.sin(angle) * dist,
                        3, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        }
    }

    drawParticles() {
        const ctx = this.ctx;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 5, 5);
            ctx.globalAlpha = 1;
        }
    }

    drawScoreCircles(players, scores) {
        if (!scores) return;

        const ctx = this.ctx;
        const { WIDTH } = GAME_CONFIG;
        const names = this.network.getState().names || { p1: 'P1', p2: 'P2' };

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Get player stats
        let p1Damage = 0, p2Damage = 0;
        let p1Grenades = 0, p2Grenades = 0;

        if (players.p1) {
            p1Damage = players.p1.damage || 0;
            p1Grenades = players.p1.grenadeCount || 0;
        }
        if (players.p2) {
            p2Damage = players.p2.damage || 0;
            p2Grenades = players.p2.grenadeCount || 0;
        }

        // Draw circles
        this.drawDamageCircle(250, 250, GAME_CONFIG.PLAYER1_COLOR, scores.p1 || 0, p1Damage, p1Grenades, names.p1);
        this.drawDamageCircle(WIDTH - 250, 250, GAME_CONFIG.PLAYER2_COLOR, scores.p2 || 0, p2Damage, p2Grenades, names.p2);

        ctx.restore();
    }

    drawDamageCircle(x, y, color, score, damage, grenadeCount, name) {
        const ctx = this.ctx;
        const radius = GAME_CONFIG.SCORE_CIRCLE_RADIUS;

        // Background circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.BLACK_TRANSPARENT;
        ctx.fill();

        // Damage fill
        const damagePercent = Math.min(damage, 100) / 100;
        if (damagePercent > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * damagePercent));
            ctx.lineTo(x, y);
            ctx.fillStyle = COLORS.RED;
            ctx.fill();
        }

        // Border ring
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.shadowBlur = 30;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Score text
        ctx.font = "bold 80px Orbitron";
        ctx.fillStyle = color;
        ctx.fillText(score, x, y);

        // Name text
        ctx.font = "bold 30px Orbitron";
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.fillText(name || "Player", x, y - 110);
        ctx.shadowBlur = 0;

        // Grenade indicators
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x - 30 + i * 30, y + 100, 10, 0, Math.PI * 2);
            if (i < grenadeCount) {
                ctx.fillStyle = 'red';
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'red';
            } else {
                ctx.fillStyle = '#333';
                ctx.shadowBlur = 0;
            }
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    // === FLOATING MESSAGES SYSTEM ===
    addFloatingDamage(x, y, damage, color) {
        this.floatingMessages.push({
            x, y,
            text: `+${damage}`,
            color,
            life: 1.0,
            vy: -2,
            vx: (Math.random() - 0.5) * 1
        });
    }

    addFloatingText(x, y, text, color = '#fff') {
        this.floatingMessages.push({
            x, y,
            text,
            color,
            life: 1.0,
            vy: -1.5,
            vx: 0
        });
    }

    drawFloatingMessages() {
        const ctx = this.ctx;

        for (let i = this.floatingMessages.length - 1; i >= 0; i--) {
            const msg = this.floatingMessages[i];
            msg.y += msg.vy;
            msg.x += msg.vx;
            msg.life -= 0.02;

            if (msg.life <= 0) {
                this.floatingMessages.splice(i, 1);
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

    start() {
        this.draw();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
}
