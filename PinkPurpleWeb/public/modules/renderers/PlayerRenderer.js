import { GAME_CONFIG, COLORS } from '../constants.js';
import { Projection3D } from '../animations/Projection3D.js';

export class PlayerRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        this.projection3D = new Projection3D();
        this.playerAnims = {};
        this.playerSizeEffects = {};
        this.trails = {};
        this.frameCounter = 0;
    }

    update(frameCounter) {
        this.frameCounter = frameCounter;
        // Update size effects
        for (const playerId in this.playerSizeEffects) {
            const effect = this.playerSizeEffects[playerId];
            if (effect.timer > 0) {
                effect.timer--;
            } else {
                delete this.playerSizeEffects[playerId];
            }
        }
    }

    addSizeEffect(playerId, multiplier, duration) {
        this.playerSizeEffects[playerId] = {
            multiplier: multiplier,
            timer: duration
        };
    }

    triggerAnimation(playerId, type, duration, data = {}) {
        this.playerAnims[playerId] = {
            type,
            startTime: Date.now(),
            duration,
            ...data
        };
    }

    drawPlayers(players, networkState) {
        const ctx = this.ctx;

        for (const id in players) {
            const p = players[id];

            // Update trail
            if (!this.trails[id]) this.trails[id] = [];
            this.trails[id].push({ x: p.x, y: p.y });
            if (this.trails[id].length > GAME_CONFIG.TRAIL_LENGTH) {
                this.trails[id].shift();
            }

            // Draw trail
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

            // Draw Player Model
            this.drawPlayerModel(p, id, networkState);
        }
    }

    drawPlayerModel(p, id, networkState) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(p.x, p.y);

        const anim = this.playerAnims[id];

        // Size Effect
        let sizeMultiplier = 1.0;
        if (this.playerSizeEffects[id]) {
            sizeMultiplier = this.playerSizeEffects[id].multiplier;
        } else if (p.sizeMultiplier) {
            sizeMultiplier = p.sizeMultiplier;
        }
        ctx.scale(sizeMultiplier, sizeMultiplier);

        // Respawn Blink
        if (p.isRespawning) {
            const blinkRate = Math.floor(this.frameCounter / 5) % 2;
            if (blinkRate === 0) ctx.globalAlpha = 0.5;
        }

        const isStunned = (anim && anim.type === 'stunned');

        // --- 1. SQUASH & STRETCH ---
        let vx = 0, vy = 0;
        if (this.trails[id] && this.trails[id].length > 1) {
            const last = this.trails[id][this.trails[id].length - 1];
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
                stretch = Math.sin(progress * Math.PI * 10) * intensity * 0.25;
                angle = Math.PI / 2;
                if (Math.random() < 0.2 * intensity) isGlitching = true;
            } else {
                delete this.playerAnims[id];
            }
        }

        // Victory spin
        const isVictory = p.victoryStance || (anim && anim.type === 'victory');

        if (isVictory) {
            stretch = 0;
            angle = 0;
            if (anim && anim.type === 'victory') {
                const t = (Date.now() - anim.startTime) / 200;
                const jumpY = Math.abs(Math.sin(t)) * -30; // Jump up
                ctx.translate(0, jumpY);
            }
        }

        ctx.rotate(angle);
        ctx.scale(1 + stretch, 1 - stretch);
        ctx.rotate(-angle);

        // --- 2. NEON + TOON BODY ---
        const r = GAME_CONFIG.PLAYER_RADIUS;
        const bodyColor = isVictory ? '#ffd700' : p.color;
        const glowColor = isVictory ? '#ffd700' : p.color;

        // A. Contour Noir (Stroke)
        ctx.shadowBlur = 0; // Pas de flou sur le contour interne
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // B. Remplissage Solide (Fill) + Glow Externe simulé
        // Pour le glow externe, on dessine d'abord un cercle flou derrière
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over'; // Dessiner derrière
        ctx.shadowBlur = isVictory ? 40 : 25;
        ctx.shadowColor = glowColor;
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Remplissage principal (opaque)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // C. Ombre "Toon" (Crescent)
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip(); // Restreindre à la sphère

        ctx.translate(-r * 0.3, r * 0.3); // Décalage de l'ombre (bas-gauche)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Ombre noire semi-transparente
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // D. Reflet "Toon" (Highlight blanc net) - REMOVED TO FIX ARTIFACTS
        // Le cercle "ovale" était perçu comme un œil en trop. On le retire pour un style plus "Flat/BD".
        /*
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        // Ovale en haut à droite
        ctx.ellipse(r * 0.4, -r * 0.4, r * 0.25, r * 0.15, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        */

        // E. Contour "Glitch" (si applicable)
        if (isGlitching) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // --- 3. FACE & EYES ---
        this.drawFace(ctx, p, id, networkState, anim, isStunned);

        // --- 4. HANDS & WEAPON ---
        this.drawHandsAndWeapon(ctx, p, anim, id);

        ctx.restore();
    }

    drawFace(ctx, p, id, networkState, anim, isStunned) {
        const facing = p.facing || 1;

        // Find opponent for eye tracking
        const opponentId = id === 'p1' ? 'p2' : 'p1';
        const opponent = networkState.players && networkState.players[opponentId];

        // LOGIC YEUX DE PROFIL
        // Si facing = 1 (droite), oeil droit visible, oeil gauche caché
        // Si facing = -1 (gauche), oeil gauche visible, oeil droit caché
        // MAIS on veut voir l'oeil "avant" principalement

        let lookX = 0, lookY = 0;

        if (opponent) {
            const dx = opponent.x - p.x;
            const dy = opponent.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            lookX = (dx / dist) * 8;
            lookY = (dy / dist) * 8;
        }

        const isVictory = p.victoryStance || (anim && anim.type === 'victory');

        if (isVictory) {
            const bounce = Math.abs(Math.sin(Date.now() / 150)) * 5;
            ctx.translate(0, -bounce);
        }

        ctx.save();
        let eyeScaleY = 1;

        if (isVictory) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.shadowBlur = 5;
            // ^ ^ Eyes (toujours visibles en face en victoire ?)
            // Disons que victoire = face caméra
            ctx.beginPath(); ctx.moveTo(-15, -5); ctx.lineTo(-10, -10); ctx.lineTo(-5, -5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(10, -10); ctx.lineTo(15, -5); ctx.stroke();
            eyeScaleY = 0;
        } else if (isStunned) {
            // X X Eyes (Face camera pour effet comique)
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffff00';
            ctx.shadowBlur = 5;
            ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-8, -2); ctx.moveTo(-18, -2); ctx.lineTo(-8, -8); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(18, -2); ctx.moveTo(8, -2); ctx.lineTo(18, -8); ctx.stroke();

            // Birds/Stars spinning above head
            const time = Date.now() / 200;
            for (let i = 0; i < 3; i++) {
                const angle = time + (i * (Math.PI * 2 / 3));
                const rx = Math.cos(angle) * 30;
                const ry = Math.sin(angle) * 10;
                const proj = this.projection3D.project(rx, -40 + ry, 0);
                ctx.fillStyle = '#ffff00';
                ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2); ctx.fill();
            }
            eyeScaleY = 0;
        } else if (anim && anim.type === 'bat_swing') {
            const direction = anim.direction || (facing === 1 ? 'right' : 'left');
            if (direction === 'up') {
                eyeScaleY = 0.6;
                lookY -= 5;
            } else {
                eyeScaleY = 0.5;
                lookX += 4 * facing;
            }
        }

        if (eyeScaleY > 0) {
            // YEUX DE PROFIL
            // On dessine l'oeil "coté direction" plus grand et plus centré
            // L'autre oeil est soit caché soit sur le bord

            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff'; // Glow blanc pour les yeux (pas de contour noir moche)

            if (facing === 1) { // Regarde à Droite
                // Oeil Droit (Visible)
                const rightEyeX = 15 + lookX * 0.3; // Décalé vers la droite
                const eyeY = -5 + lookY * 0.3;

                // Forme amande/ovale
                ctx.beginPath();
                ctx.ellipse(rightEyeX, eyeY, 8, 8 * eyeScaleY, 0, 0, Math.PI * 2);
                ctx.fill();

                // Oeil Gauche (Caché ou petit sur le bord gauche du nez)
                // On ne le dessine pas en vrai profil strict
            } else { // Regarde à Gauche
                // Oeil Gauche (Visible)
                const leftEyeX = -15 + lookX * 0.3; // Décalé vers la gauche
                const eyeY = -5 + lookY * 0.3;

                ctx.beginPath();
                ctx.ellipse(leftEyeX, eyeY, 8, 8 * eyeScaleY, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    drawHandsAndWeapon(ctx, p, anim, id) {
        const facing = p.facing || 1;
        const time = Date.now() / 200;
        const flY = Math.sin(time) * 5;

        // Default Idle Positions
        // Inversion des mains selon la direction pour perspective cohérente
        let h1x3D, h1y3D, h1z3D;
        let h2x3D, h2y3D, h2z3D;

        if (facing === 1) { // Regarde Droite
            h1x3D = 25;  // Main Avant (Droite)
            h1y3D = 10 + flY;
            h1z3D = 10;  // Devant

            h2x3D = -20; // Main Arrière (Gauche)
            h2y3D = 15 + flY; // Un peu plus basse pour perspective
            h2z3D = -10; // Derrière
        } else { // Regarde Gauche
            h1x3D = -25; // Main Avant (Gauche)
            h1y3D = 10 + flY;
            h1z3D = 10; // Devant

            h2x3D = 20; // Main Arrière (Droite)
            h2y3D = 15 + flY; // Un peu plus basse
            h2z3D = -10; // Derrière
        }

        let batRotation = -Math.PI / 4 * facing;
        let bodyRotationZ = 0;
        let batVisible = true;

        const isVictory = p.victoryStance || (anim && anim.type === 'victory');

        if (isVictory) {
            const t = Date.now() / 200;
            // Arms up in V
            h1x3D = 35 * Math.cos(t);
            h1y3D = -30;
            h1z3D = 35 * Math.sin(t);

            h2x3D = -35 * Math.cos(t);
            h2y3D = -30;
            h2z3D = -35 * Math.sin(t);

            batRotation = -Math.PI / 2;
            // Spin effect handled by rotating camera or projecting points with rotation
            // Here simplified: simple orbital movement
        }
        else if (anim && anim.type === 'bat_swing') {
            const elapsed = Date.now() - anim.startTime;
            if (elapsed < anim.duration) {
                const progress = elapsed / anim.duration;
                const direction = anim.direction || (facing === 1 ? 'right' : 'left');

                // --- UP ATTACK (Demi-cercle uppercut) ---
                if (direction === 'up') {
                    // Uppercut: starts low, ends high
                    // Arc de cercle vertical devant le corps

                    const t = progress; // 0 to 1

                    // Arc trajectory: Bas -> Devant -> Haut
                    // Pour facing=1 (droite): Bas (3*PI/2) -> Devant (0) -> Haut (-PI/2)
                    // Pour facing=-1 (gauche): Bas (3*PI/2) -> Devant (PI) -> Haut (-PI/2)
                    const startAngle = 3 * Math.PI / 2; // Bas (270 deg)
                    const endAngle = -Math.PI / 2; // Haut (-90 deg)

                    // Ease out pour un mouvement fluide
                    const ease = 1 - Math.pow(1 - t, 3);
                    const currentAngle = startAngle + (endAngle - startAngle) * ease;

                    const pivotX = 20 * facing;
                    const pivotY = 0;
                    const radius = 50;

                    h1x3D = pivotX + Math.cos(currentAngle) * radius * facing;
                    h1y3D = pivotY + Math.sin(currentAngle) * radius;
                    h1z3D = 20 * Math.sin(t * Math.PI); // Comes forward a bit

                    batRotation = (currentAngle - Math.PI / 2) * facing;
                    bodyRotationZ = -0.1 * facing + (0.2 * t * facing); // Slight tilt

                    // Smear: doit suivre l'arc de bas en haut
                    if (progress > 0.1 && progress < 0.6) {
                        ctx.save();
                        ctx.translate(pivotX, pivotY);

                        // Arc de 3*PI/2 (Bas) à -PI/2 (Haut)
                        // Pour facing=1: passe par 0 (Devant Droite) => CW (false)
                        // Pour facing=-1: passe par PI (Devant Gauche) => CCW (true)

                        let sAngle = startAngle; // 3*PI/2
                        let eAngle = currentAngle; // Va de 3*PI/2 à -PI/2
                        let ccw = false; // CW pour facing 1 (passe par 0)

                        if (facing === -1) {
                            // Pour facing -1, on veut que l'arc passe par PI (devant gauche)
                            // On peut ajuster les angles ou simplement inverser le sens
                            // En fait, avec facing -1, cos(currentAngle) devient négatif, donc l'arc est déjà à gauche
                            // Mais pour le smear, on veut qu'il passe par PI
                            // Solution: utiliser les angles miroirs ou simplement inverser le sens
                            ccw = true; // CCW pour facing -1 (passe par PI)
                        }

                        this.drawSmear(ctx, radius, sAngle, eAngle, ccw);
                        ctx.restore();
                    }

                    // --- RIGHT ATTACK (Arc vers la droite) ---
                } else if (direction === 'right') {
                    const swingDir = 1; // Toujours vers la droite visuelle

                    const startAngle = -Math.PI / 1.5; // Arrière haut
                    const endAngle = Math.PI / 3;      // Avant bas

                    // EaseOutCubic
                    const ease = 1 - Math.pow(1 - progress, 3);
                    const currentAngle = startAngle + (endAngle - startAngle) * ease;

                    const pivotX = 10;
                    const pivotY = 0;
                    const radius = 60;

                    h1x3D = pivotX + Math.cos(currentAngle) * radius;
                    h1y3D = pivotY + Math.sin(currentAngle) * radius;
                    h1z3D = 10;

                    // Correction pour faire "face" à droite
                    if (facing === -1) h1z3D = -10;

                    batRotation = currentAngle + Math.PI / 2;

                    if (progress < 0.5) {
                        ctx.save();
                        ctx.translate(pivotX, pivotY);
                        this.drawSmear(ctx, radius, startAngle, currentAngle, false);
                        ctx.restore();
                    }

                    // --- LEFT ATTACK (Arc vers la gauche) ---
                } else { // direction === 'left'
                    // Symétrique à Right
                    const baseStartAngle = -Math.PI / 1.5;
                    const baseEndAngle = Math.PI / 3;
                    const ease = 1 - Math.pow(1 - progress, 3);
                    const currentBaseAngle = baseStartAngle + (baseEndAngle - baseStartAngle) * ease;

                    const pivotX = -10;
                    const pivotY = 0;
                    const radius = 60;

                    h1x3D = pivotX - (Math.cos(currentBaseAngle) * radius); // Inverse X
                    h1y3D = pivotY + Math.sin(currentBaseAngle) * radius;
                    h1z3D = 10;
                    if (facing === 1) h1z3D = -10; // Bras gauche derrière si regarde droite

                    // Rotation batte miroir
                    batRotation = -(currentBaseAngle + Math.PI / 2);

                    // Smear needs adjusted angles
                    if (progress < 0.5) {
                        ctx.save();
                        ctx.translate(pivotX, pivotY);
                        // Mirror angles: PI - angle
                        const sAngle = Math.PI - baseStartAngle;
                        const eAngle = Math.PI - currentBaseAngle;
                        // 300 -> 120. Via 180. => CW (false)

                        this.drawSmear(ctx, radius, sAngle, eAngle, false); // WAS TRUE -> NOW FALSE (CW)
                        ctx.restore();
                    }
                }

            } else {
                delete this.playerAnims[id];
            }
        }

        if (bodyRotationZ !== 0) ctx.rotate(bodyRotationZ);

        const h1Proj = this.projection3D.project(h1x3D, h1y3D, h1z3D);
        const h2Proj = this.projection3D.project(h2x3D, h2y3D, h2z3D);

        // Draw Order based on Z
        const hand1 = () => {
            // Front Hand & Bat
            ctx.save();
            ctx.translate(h1Proj.x, h1Proj.y);
            ctx.rotate(batRotation);

            // Batte Toon
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#000';

            // Handle
            ctx.fillStyle = '#ccc';
            ctx.fillRect(-2, -5, 15, 6);
            ctx.strokeRect(-2, -5, 15, 6);

            // Bat Body
            ctx.beginPath();
            ctx.moveTo(10, -5); ctx.lineTo(80, -10);
            ctx.quadraticCurveTo(90, -5, 90, 0);
            ctx.quadraticCurveTo(90, 5, 80, 10);
            ctx.lineTo(10, 5);
            ctx.closePath();

            ctx.fillStyle = '#fff'; // White Bat
            ctx.fill();
            ctx.stroke();

            // Hand on top (Toon)
            ctx.fillStyle = isVictory ? '#ffd700' : p.color;
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#000';
            ctx.stroke();

            ctx.restore();
        };

        const hand2 = () => {
            // Back Hand (Free hand - Toon)
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(h2Proj.x, h2Proj.y, 8, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#000';
            ctx.stroke();
        };

        if (h1z3D < h2z3D) {
            hand1(); hand2();
        } else {
            hand2(); hand1();
        }
    }

    drawSmear(ctx, radius, startAngle, endAngle, counterClockwise) {
        ctx.save();
        // Smear "Toon" (Solid + Outline)
        ctx.lineWidth = 40;
        ctx.lineCap = 'round';

        // 1. Outline (Gros trait blanc transparent)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, radius, startAngle, endAngle, counterClockwise);
        ctx.stroke();

        // 2. Core (Trait fin net)
        ctx.lineWidth = 15;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f3ff'; // Cyan smear
        ctx.beginPath();
        ctx.arc(0, 0, radius, startAngle, endAngle, counterClockwise);
        ctx.stroke();

        ctx.restore();
    }

    drawThreads(players) {
        const ctx = this.ctx;
        for (const id in players) {
            const p = players[id];
            if (p.threadActive) {
                ctx.save();
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3;
                ctx.shadowBlur = 10;
                ctx.shadowColor = p.color;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.threadActive.x, p.threadActive.y);
                ctx.stroke();

                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.threadActive.x, p.threadActive.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    drawWebs(players) {
        const ctx = this.ctx;
        for (const id in players) {
            const p = players[id];
            if (p.webActive) {
                ctx.save();
                const web = p.webActive;
                const alpha = 0.6 - (web.age / 600) * 0.3;

                ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
                ctx.shadowBlur = 20;
                ctx.shadowColor = p.color;
                ctx.beginPath(); ctx.arc(web.x, web.y, web.radius, 0, Math.PI * 2); ctx.fill();

                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = 2;
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(web.x, web.y);
                    ctx.lineTo(web.x + Math.cos(angle) * web.radius, web.y + Math.sin(angle) * web.radius);
                    ctx.stroke();
                }

                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let r = 10; r < web.radius; r += 15) {
                    const angle = (r / web.radius) * Math.PI * 4;
                    const x = web.x + Math.cos(angle) * r;
                    const y = web.y + Math.sin(angle) * r;
                    if (r === 10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}
