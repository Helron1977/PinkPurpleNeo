/**
 * Rendering Module
 * Handles all canvas drawing operations
 */

import { GAME_CONFIG, COLORS } from './constants.js';
import { AnimationSystem } from './animations/AnimationSystem.js';

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
        this.frameCounter = 0;
        this.frozenPlayers = null;

        // Camera / Zoom effects
        this.cameraZoom = 1.0;
        this.cameraFocus = { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
        this.targetZoom = 1.0;
        this.slowMotionFactor = 1.0;

        // Visual effects for hits
        this.hitEffects = []; // {x, y, radius, life, type: 'shockwave'|'pow'}

        // Optimization: Off-screen canvas for obstacles
        this.obstaclesCanvas = document.createElement('canvas');
        this.obstaclesCtx = this.obstaclesCanvas.getContext('2d');

        // New Procedural Animation System
        this.animSystem = new AnimationSystem();

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
        this.animSystem.trigger(playerId, 'bounce', { duration: 400 });
        
        // Particles
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

    triggerSwing(attackerId, direction = 'horizontal') {
        this.animSystem.trigger(attackerId, 'swing', { duration: 300, direction: direction });
    }

    triggerHitEffect(attackerId, victimId, damage, ejectionAngle = 0, hitOffsetX = 0) {
        const state = this.network.getState();
        const attacker = state.players[attackerId];
        const victim = state.players[victimId];

        if (!attacker || !victim) return;

        // Cache frozen state for rendering during HitStop
        this.frozenPlayers = JSON.parse(JSON.stringify(state.players));

        // 1. RALENTI + FREEZE FRAME (Arrêt sur image)
        this.hitStopDuration = 120; // 2s à 60fps (ralenti)
        this.hitStopTimer = this.hitStopDuration;
        this.slowMotionFactor = 0.3; // Ralentir à 30% de la vitesse normale

        // 2. ZOOM on Action - Plus prononcé
        this.cameraFocus = {
            x: (attacker.x + victim.x) / 2,
            y: (attacker.y + victim.y) / 2
        };
        this.cameraZoom = 2.0; // Zoom plus fort
        this.targetZoom = 2.5; // Zoom maximum pendant le hit stop

        // 3. TRIGGER ANIMATIONS
        this.animSystem.trigger(attackerId, 'victory_pose', { duration: 2000 });
        this.animSystem.trigger(victimId, 'stunned', { duration: 1500 });

        // 4. Visual Effects: POW cartoon AMÉLIORÉ (plus visible et intense)
        const hitX = victim.x;
        const hitY = victim.y;
        
        // POW cartoon (apparaît immédiatement) - PLUS GRAND ET PLUS VISIBLE
        this.hitEffects.push({
            x: hitX,
            y: hitY,
            radius: 0,
            maxRadius: 100, // Augmenté de 60 à 100
            life: 0.8, // Plus long pour être plus visible
            type: 'pow_cartoon',
            color: '#ffffff',
            angle: ejectionAngle
        });

        // Shockwave (onde de choc circulaire) - PLUS INTENSE
        this.hitEffects.push({
            x: hitX,
            y: hitY,
            radius: 0,
            maxRadius: 200, // Augmenté de 150 à 200
            life: 1.2, // Plus long
            type: 'shockwave',
            color: attacker.color || '#ff0044'
        });

        // 5. Particles (étincelles) - BEAUCOUP PLUS NOMBREUSES
        if (victim) {
            for (let i = 0; i < 120; i++) { // Doublé de 60 à 120
                const angle = ejectionAngle + (Math.random() - 0.5) * Math.PI * 1.5; // Angle plus large
                const speed = 30 + Math.random() * 60; // Vitesse augmentée
                this.particles.push({
                    x: victim.x,
                    y: victim.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 2.0 + Math.random() * 1.0, // Plus long
                    color: i % 4 === 0 ? '#ff0044' : (i % 4 === 1 ? '#fff' : (i % 4 === 2 ? attacker.color || '#00ffff' : '#ffff00')), 
                    type: 'spark',
                    size: 3 + Math.random() * 4 // Plus grandes
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
        // IMPORTANT: Ne pas freeze les joueurs, juste ralentir (la batte doit continuer son mouvement)
        let renderPlayers = players; // Toujours utiliser l'état live (pas de freeze)

        if (this.hitStopTimer > 0) {
            // Ralentir le timer selon le slow motion factor
            this.hitStopTimer -= (1 - (this.slowMotionFactor || 1) * 0.7); // Ralentir le countdown aussi

            // Invert flash at start (Impact) - très court
            if (this.hitStopTimer > this.hitStopDuration - 3) {
                this.ctx.filter = 'invert(1) contrast(2)';
            } else {
                this.ctx.filter = 'none';
            }

            // Phase 1: Ralenti + Zoom (première moitié)
            const slowPhase = this.hitStopTimer > this.hitStopDuration * 0.5;
            if (slowPhase) {
                this.targetZoom = 2.5;
                this.slowMotionFactor = 0.3; // Ralenti à 30%
            } else {
                // Phase 2: Reprendre progressivement (seconde moitié)
                const progress = (this.hitStopDuration * 0.5 - this.hitStopTimer) / (this.hitStopDuration * 0.5);
                this.targetZoom = 2.5 - (1.5 * progress); // Zoom out progressif
                this.slowMotionFactor = 0.3 + (0.7 * progress); // Reprendre la vitesse progressivement
            }

        } else {
            // Resume speed normale
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
        this.drawHitEffects(); // Dessiner les effets de contact AVANT les particules
        this.drawParticles();
        this.drawScoreCircles(players, scores);
        this.drawFloatingMessages();

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
            
            // Vérification de sécurité
            if (!p || p.x === undefined || p.y === undefined || isNaN(p.x) || isNaN(p.y)) {
                continue;
            }

            // 1. Mise à jour de l'animation procédurale
            // Passer le slowMotionFactor pour ralentir l'animation pendant le hit stop
            const animState = this.animSystem.update(id, p, this.slowMotionFactor || 1.0);

            // 2. Traînée (Trail) - comme l'original, avec filtrage simple des sauts
            if (!this.trails[id]) this.trails[id] = [];
            
            const lastPoint = this.trails[id][this.trails[id].length - 1];
            
            // Si premier point ou distance raisonnable, ajouter
            if (!lastPoint) {
                this.trails[id].push({ x: p.x, y: p.y });
            } else {
                const dx = p.x - lastPoint.x;
                const dy = p.y - lastPoint.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Si saut trop grand (téléportation), réinitialiser la traînée
                if (dist > 200) {
                    this.trails[id] = [{ x: p.x, y: p.y }];
                } else {
                    this.trails[id].push({ x: p.x, y: p.y });
                }
            }
            
            // Limiter la longueur
            if (this.trails[id].length > GAME_CONFIG.TRAIL_LENGTH) {
                this.trails[id].shift();
            }

            // Dessin de la traînée
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

            // 3. Dessin du modèle avec les offsets d'animation
            this.drawPlayerModel(ctx, p, id, animState);
        }
    }

    drawPlayerModel(ctx, p, id, anim) {
        ctx.save();
        
        // 1. Position de base (Serveur)
        ctx.translate(p.x, p.y);

        // 2. Transformations procédurales (Animation System)
        if (anim.rotation) ctx.rotate(anim.rotation);
        if (anim.scaleX !== 1 || anim.scaleY !== 1) {
            ctx.scale(anim.scaleX, anim.scaleY);
        }
        ctx.globalAlpha = anim.opacity || 1;

        // Déclarer facing tôt pour l'utiliser partout
        const facing = p.facing || 1;

        // --- CORPS (Cercle Neon) - Dessiné en deux parties pour cacher la batte ---
        const r = GAME_CONFIG.PLAYER_RADIUS;
        const isGold = p.victoryStance;
        
        // Partie avant du corps (côté facing) - dessinée APRÈS la batte pour la cacher
        // On dessinera cette partie plus tard, après les mains
        
        // Partie arrière du corps (côté opposé) - dessinée AVANT les mains
        ctx.shadowBlur = 0;
        ctx.fillStyle = isGold ? '#ffd700' : p.color;
        ctx.globalAlpha = (isGold ? 0.4 : 0.2) * (anim.opacity || 1);
        
        // Dessiner seulement la moitié arrière du cercle
        ctx.beginPath();
        if (facing === 1) {
            // Facing right : dessiner la moitié gauche (arrière)
            ctx.arc(0, 0, r, Math.PI / 2, 3 * Math.PI / 2);
        } else {
            // Facing left : dessiner la moitié droite (arrière)
            ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        }
        ctx.fill();

        ctx.globalAlpha = anim.opacity || 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = isGold ? '#ffd700' : p.color;
        ctx.shadowBlur = isGold ? 30 : 20;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = isGold ? '#ffd700' : p.color;
        ctx.lineWidth = isGold ? 2 : 1;
        ctx.stroke();

        // --- YEUX (Procedural) ---
        const state = this.network.getState();
        const opponentId = id === 'p1' ? 'p2' : 'p1';
        const opponent = state.players && state.players[opponentId];

        let lookX = facing * 8; // Regarder dans la direction du mouvement (plus prononcé)
        let lookY = 0;
        
        // Si adversaire présent, combiner avec regard vers adversaire
        if (opponent) {
            const dx = opponent.x - p.x;
            const dy = opponent.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            // Mélanger regard direction + regard adversaire (60% direction, 40% adversaire)
            lookX = (facing * 8 * 0.6) + ((dx / dist) * 12 * 0.4);
            lookY = (dy / dist) * 12 * 0.4;
        }

        ctx.save();
        if (this.animSystem.activeAnimations.get(id)?.currentAction === 'stunned') {
            // Spiral Eyes - JAUNES (étourdissement)
            const t = Date.now() / 100;
            
            [-15, 15].forEach(offsetX => {
                ctx.beginPath();
                for(let i=0; i<3; i+=0.2) {
                    const radius = i*2;
                    const angle = i*4 + t;
                    ctx.lineTo(offsetX + Math.cos(angle)*radius, -5 + Math.sin(angle)*radius);
                }
                // Contour jaune brillant
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#ffff00';
                ctx.stroke();
                // Intérieur jaune plus clair
                ctx.strokeStyle = '#ffffaa';
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 0;
                ctx.stroke();
            });
        } else {
            // Normal Eyes
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
            ctx.beginPath();
            ctx.ellipse(-15 + lookX * 0.3, -5 + lookY * 0.3, 6, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(15 + lookX * 0.3, -5 + lookY * 0.3, 6, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // --- MAINS (Offsets Animation System) ---
        // Déterminer quelle main tient la batte selon facing (facing déjà déclaré plus haut)
        const batHand = (facing === 1) ? anim.handRight : anim.handLeft; // Droite si facing right, gauche si facing left
        const otherHand = (facing === 1) ? anim.handLeft : anim.handRight;
        
        // Main arrière (sans batte)
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(otherHand.x, otherHand.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Main avec batte (devant)
        ctx.save();
        ctx.translate(batHand.x, batHand.y);
        
        // Angle de la batte : pour la main gauche, inverser l'angle pour symétrie
        let batAngle = anim.batAngle;
        if (facing === -1) {
            // Inverser l'angle pour la main gauche (symétrie horizontale)
            // Si l'angle est négatif, on le rend positif et vice versa
            batAngle = -batAngle;
        }
        ctx.rotate(batAngle);

        // Batte - dessinée avec le manche au centre (0,0) et la tête vers la droite
        // Pour la main gauche, on dessine la batte inversée (tête vers la gauche)
        ctx.fillStyle = '#eee';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 15;
        
        if (facing === 1) {
            // Main droite : batte normale (tête vers la droite)
            ctx.fillRect(-2, -5, 15, 6); // Manche
            ctx.beginPath();
            ctx.moveTo(10, -5);
            ctx.lineTo(80, -10);
            ctx.quadraticCurveTo(90, -5, 90, 0);
            ctx.quadraticCurveTo(90, 5, 80, 10);
            ctx.lineTo(10, 5);
            ctx.fill();
        } else {
            // Main gauche : batte inversée (tête vers la gauche)
            ctx.fillRect(-13, -5, 15, 6); // Manche (inversé)
            ctx.beginPath();
            ctx.moveTo(-10, -5);
            ctx.lineTo(-80, -10);
            ctx.quadraticCurveTo(-90, -5, -90, 0);
            ctx.quadraticCurveTo(-90, 5, -80, 10);
            ctx.lineTo(-10, 5);
            ctx.fill();
        }

        // Main (sur le manche)
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore(); // Fin main avec batte
        
        // Partie avant du corps (côté facing) - dessinée APRÈS pour cacher la batte qui passe derrière
        ctx.shadowBlur = 0;
        ctx.fillStyle = isGold ? '#ffd700' : p.color;
        ctx.globalAlpha = (isGold ? 0.4 : 0.2) * (anim.opacity || 1);
        
        ctx.beginPath();
        if (facing === 1) {
            // Facing right : dessiner la moitié droite (avant)
            ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        } else {
            // Facing left : dessiner la moitié gauche (avant)
            ctx.arc(0, 0, r, Math.PI / 2, 3 * Math.PI / 2);
        }
        ctx.fill();

        ctx.globalAlpha = anim.opacity || 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = isGold ? '#ffd700' : p.color;
        ctx.shadowBlur = isGold ? 30 : 20;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = isGold ? '#ffd700' : p.color;
        ctx.lineWidth = isGold ? 2 : 1;
        ctx.stroke();
        
        ctx.restore(); // Fin joueur
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

    drawHitEffects() {
        const ctx = this.ctx;
        const deltaTime = 0.016; // ~60fps
        
        for (let i = this.hitEffects.length - 1; i >= 0; i--) {
            const effect = this.hitEffects[i];
            effect.life -= deltaTime;
            
            if (effect.life <= 0) {
                this.hitEffects.splice(i, 1);
                continue;
            }
            
            // Calculer la durée de vie maximale selon le type
            const maxLife = effect.type === 'shockwave' ? 1.2 : (effect.type === 'pow_cartoon' ? 0.8 : 1.0);
            const progress = Math.max(0, Math.min(1, 1 - (effect.life / maxLife)));
            
            if (effect.type === 'shockwave') {
                // Onde de choc circulaire qui s'étend
                effect.radius = Math.max(0, effect.maxRadius * progress); // S'assurer que le rayon n'est jamais négatif
                const alpha = 1 - progress;
                
                ctx.save();
                ctx.strokeStyle = effect.color;
                ctx.lineWidth = 3;
                ctx.globalAlpha = alpha * 0.8;
                ctx.shadowBlur = 20;
                ctx.shadowColor = effect.color;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (effect.type === 'pow') {
                // Effet POW (explosion de contact)
                effect.radius = Math.max(0, effect.maxRadius * (1 - Math.pow(1 - progress, 2))); // S'assurer que le rayon n'est jamais négatif
                const alpha = Math.max(0, Math.min(1, 1 - progress));
                
                ctx.save();
                ctx.translate(effect.x, effect.y);
                ctx.rotate(effect.angle || 0);
                
                // Cercle central brillant
                ctx.fillStyle = effect.color;
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 30;
                ctx.shadowColor = effect.color;
                ctx.beginPath();
                ctx.arc(0, 0, effect.radius * 0.3, 0, Math.PI * 2);
                ctx.fill();
                
                // Rayons explosifs
                ctx.strokeStyle = effect.color;
                ctx.lineWidth = 4;
                ctx.globalAlpha = alpha * 0.6;
                for (let j = 0; j < 8; j++) {
                    const angle = (j / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(angle) * effect.radius, Math.sin(angle) * effect.radius);
                    ctx.stroke();
                }
                
                ctx.restore();
            } else if (effect.type === 'pow_cartoon') {
                // Effet POW cartoon AMÉLIORÉ - PLUS GRAND ET PLUS VISIBLE
                const scale = 1 + progress * 1.0; // Grandit plus (de 0.5 à 1.0)
                const alpha = 1 - progress; // Disparaît progressivement
                
                ctx.save();
                ctx.translate(effect.x, effect.y);
                ctx.rotate(effect.angle || 0);
                ctx.scale(scale, scale);
                
                // Texte "POW!" style cartoon - PLUS GRAND
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 6; // Contour plus épais (de 4 à 6)
                ctx.font = 'bold 48px Arial'; // Plus grand (de 32 à 48)
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 20; // Ombre plus prononcée (de 10 à 20)
                ctx.shadowColor = '#ffff00';
                
                // Contour noir épais
                ctx.strokeText('POW!', 0, 0);
                // Texte blanc
                ctx.fillText('POW!', 0, 0);
                
                // Étoiles autour (effet cartoon) - PLUS NOMBREUSES ET PLUS VISIBLES
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3; // Plus épais (de 2 à 3)
                ctx.globalAlpha = alpha * 0.8; // Plus visible (de 0.6 à 0.8)
                for (let j = 0; j < 8; j++) { // Plus nombreuses (de 4 à 8)
                    const starAngle = (j / 8) * Math.PI * 2;
                    const starDist = 40; // Plus loin (de 25 à 40)
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(starAngle) * starDist, Math.sin(starAngle) * starDist);
                    ctx.stroke();
                }
                
                ctx.restore();
            }
        }
    }

    drawParticles() {
        const ctx = this.ctx;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * 0.1;
            p.y += p.vy * 0.1;
            p.life -= 0.02;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            const alpha = Math.min(1, p.life);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 5;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
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
