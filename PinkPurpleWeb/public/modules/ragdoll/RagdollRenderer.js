/**
 * RagdollRenderer
 * 
 * Rendu du personnage sphérique avec déformations ragdoll
 * Style cohérent avec le rendering actuel (neon glow)
 * 
 * Responsabilités:
 * - Corps avec déformations
 * - Mains et batte
 * - Yeux (normaux, stunned, victory stance)
 * - Effets visuels (glow, stunned, victory)
 */

import { GAME_CONFIG } from '../constants.js';

export class RagdollRenderer {
    constructor(ctx, networkManager = null, renderer = null) {
        this.ctx = ctx;
        this.network = networkManager;
        this.renderer = renderer; // Pour accéder aux trails
    }

    /**
     * Dessine le personnage complet (ragdoll ou normal)
     * @param {Object} ragdollState - État du ragdoll (peut être null si pas activé)
     * @param {Object} playerState - État du joueur (position, facing, etc.)
     * @param {Object} style - Style (color, glowColor)
     * @param {Object} anim - Animation (bat_swing, stunned, etc.)
     * @param {boolean} isRagdollActive - Si le ragdoll est activé
     */
    drawPlayer(ragdollState, playerState, style, anim = null, isRagdollActive = false) {
        if (!playerState || playerState.x === undefined || playerState.y === undefined) {
            console.warn('drawPlayer: playerState invalide', playerState);
            return;
        }

        const ctx = this.ctx;
        
        // CRITICAL: Si le ragdoll n'est PAS activé, utiliser TOUJOURS les positions du joueur
        // Le ragdoll.core peut avoir des positions obsolètes
        let core;
        if (isRagdollActive && ragdollState && ragdollState.core) {
            // Ragdoll actif : utiliser les positions du ragdoll (physique en cours)
            core = ragdollState.core;
        } else if (ragdollState && ragdollState.core) {
            // Ragdoll inactif mais avec poses procédurales : utiliser core avec déformations
            core = {
                ...ragdollState.core,
                x: playerState.x || 0, // Position du serveur
                y: playerState.y || 0  // Position du serveur
            };
        } else {
            // Ragdoll inactif : utiliser les positions du joueur (serveur)
            core = {
                x: playerState.x || 0,
                y: playerState.y || 0,
                rotation: 0,
                deformX: 1.0,
                deformY: 1.0,
                deformAngle: 0
            };
        }

        // Vérifier que core a des coordonnées valides
        if (isNaN(core.x) || isNaN(core.y)) {
            console.warn('drawPlayer: core invalide', core, 'playerState:', playerState);
            return;
        }

        ctx.save();
        ctx.translate(core.x, core.y);

        // 1. Dessiner main gauche (derrière)
        // Utiliser les mains du ragdoll si disponible (ragdoll actif OU poses procédurales)
        if (ragdollState && ragdollState.leftHand) {
            if (isRagdollActive) {
                // Position absolue - convertir en relatif au contexte
                const handX = ragdollState.leftHand.x - core.x;
                const handY = ragdollState.leftHand.y - core.y;
                this.drawHand({ x: handX, y: handY }, style);
            } else if (ragdollState.leftHand.targetOffsetX !== undefined) {
                // Position relative depuis targetOffset (poses procédurales)
                this.drawHand({ x: ragdollState.leftHand.targetOffsetX, y: ragdollState.leftHand.targetOffsetY }, style);
            } else {
                // Fallback
                const facing = playerState.facing || 1;
                const time = Date.now() / 200;
                const flY = Math.sin(time) * 5;
                this.drawHand({ x: -20 * facing, y: 10 + flY }, style);
            }
        } else {
            // Position normale des mains (fallback)
            const facing = playerState.facing || 1;
            const time = Date.now() / 200;
            const flY = Math.sin(time) * 5;
            this.drawHand({ x: -20 * facing, y: 10 + flY }, style);
        }

        // 2. Dessiner corps avec déformation
        // Passer les trails pour calculer la vélocité et la déformation
        const trails = this.renderer && this.renderer.trails ? this.renderer.trails[playerState.id] : null;
        this.drawCore(core, style, playerState, anim, trails, playerState.id);

        // 3. Dessiner yeux
        this.drawEyes(core, playerState, anim, style);

        // 4. Dessiner main droite + batte (devant)
        // Utiliser les mains du ragdoll si disponible (ragdoll actif OU poses procédurales)
        if (ragdollState && ragdollState.rightHand) {
            let handPos, batAngle;
            if (isRagdollActive) {
                // Position absolue - convertir en relatif au contexte
                const handX = ragdollState.rightHand.x - core.x;
                const handY = ragdollState.rightHand.y - core.y;
                handPos = { x: handX, y: handY };
                batAngle = ragdollState.batAngle;
            } else {
                // Position relative depuis targetOffset (poses procédurales)
                handPos = { x: ragdollState.rightHand.targetOffsetX || 20, y: ragdollState.rightHand.targetOffsetY || 10 };
                batAngle = ragdollState.batAngle !== undefined ? ragdollState.batAngle : -Math.PI / 4 * (playerState.facing || 1);
            }
            this.drawHandWithBat(handPos, batAngle, style, playerState, anim);
        } else {
            // Position normale de la batte
            const facing = playerState.facing || 1;
            const time = Date.now() / 200;
            const flY = Math.sin(time) * 5;
            let h1x = 25 * facing;
            let h1y = 10 + flY;
            let batRotation = -Math.PI / 4 * facing;
            
            // Animation de frappe
            if (anim && anim.type === 'bat_swing') {
                const elapsed = Date.now() - anim.startTime;
                if (elapsed < anim.duration) {
                    const progress = elapsed / anim.duration;
                    if (progress < 0.3) {
                        const t = progress / 0.3;
                        h1x -= 20 * facing * t;
                        h1y -= 10 * t;
                        batRotation = (-Math.PI / 4 - Math.PI / 2 * t) * facing;
                    } else if (progress < 0.35) {
                        h1x += 60 * facing;
                        batRotation = Math.PI / 2 * facing;
                    } else if (progress < 0.6) {
                        h1x = 40 * facing;
                        h1y = 0;
                        batRotation = Math.PI / 2 * facing;
                    } else {
                        h1x = 25 * facing;
                        h1y = 10;
                        batRotation = -Math.PI / 4 * facing;
                    }
                }
            }
            
            this.drawHandWithBat(
                { x: h1x, y: h1y },
                batRotation,
                style,
                playerState,
                anim
            );
        }

        ctx.restore();
    }

    /**
     * Dessine le personnage en mode ragdoll (ancienne méthode, gardée pour compatibilité)
     */
    drawRagdoll(ragdollState, style) {
        if (!ragdollState) return;
        this.drawPlayer(ragdollState, null, style, null, true);
    }

    /**
     * Dessine le corps sphérique avec déformation
     */
    drawCore(core, style, playerState = null, anim = null, trails = null, playerId = null) {
        const ctx = this.ctx;

        ctx.save();
        
        // Rotation du corps (seulement si significative)
        if (core.rotation && Math.abs(core.rotation) > 0.01) {
            ctx.rotate(core.rotation);
        }

        // EFFET DE REBOND PROCÉDURAL (comme avant) - basé sur la vélocité
        let stretch = 0;
        let angle = 0;
        let isGlitching = false;

        // Si le core a déjà des déformations (poses procédurales), les utiliser
        if (core.deformX !== undefined && core.deformY !== undefined) {
            stretch = (core.deformX - 1.0) * 0.5; // Convertir en stretch
            angle = core.deformAngle || 0;
        } else {
            // Sinon, calculer depuis les trails (comme dans drawPlayerModel original)
            if (trails && trails.length > 1) {
                const last = trails[trails.length - 1];
                const prev = trails[trails.length - 2] || last;
                const vx = (last.x - prev.x) * 5;
                const vy = (last.y - prev.y) * 5;
                stretch = Math.min(Math.sqrt(vx * vx + vy * vy) * 0.02, 0.3);
                angle = Math.atan2(vy, vx);
            }
        }

        // Animation de déformation (bounce) - OVERRIDE tout
        if (anim && anim.type === 'deformation') {
            const elapsed = Date.now() - anim.startTime;
            if (elapsed < anim.duration) {
                const progress = elapsed / anim.duration;
                const intensity = (1 - progress);
                // Jelly wobble (comme avant)
                stretch = Math.sin(progress * Math.PI * 10) * intensity * 0.25;
                angle = Math.PI / 2; // Vertical squash
                if (Math.random() < 0.2 * intensity) isGlitching = true;
            } else {
                // Animation terminée, ne pas la supprimer ici (géré ailleurs)
            }
        }

        // Appliquer déformation (squash & stretch) - comme avant
        ctx.rotate(angle);
        ctx.scale(1 + stretch, 1 - stretch);
        ctx.rotate(-angle);

        // Victory Laugh Shake - appliqué AVANT le dessin
        if (playerState && playerState.victoryStance) {
            const shake = Math.sin(Date.now() / 50) * 3;
            ctx.translate(0, shake);
        }

        const r = GAME_CONFIG.PLAYER_RADIUS;

        // VICTORY STANCE: Change color to GOLD
        const bodyColor = (playerState && playerState.victoryStance) ? '#ffd700' : style.color;
        const glowColor = (playerState && playerState.victoryStance) ? '#ffd700' : style.glowColor;

        // Style neon - UN SEUL cercle avec fill et stroke
        ctx.shadowBlur = 0;
        ctx.fillStyle = bodyColor;
        ctx.globalAlpha = (playerState && playerState.victoryStance) ? 0.4 : 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Stroke avec glow
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = isGlitching ? '#ffffff' : '#ffffff';
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = (playerState && playerState.victoryStance) ? 30 : 20;
        ctx.stroke(); // Réutiliser le path du fill

        // Overlay color - ligne plus fine
        ctx.shadowBlur = 0;
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = (playerState && playerState.victoryStance) ? 2 : 1;
        ctx.stroke(); // Réutiliser le même path

        ctx.restore();
    }

    /**
     * Dessine les yeux avec toutes les expressions
     */
    drawEyes(core, playerState, anim, style) {
        const ctx = this.ctx;

        ctx.save();

        // Vérifier si le joueur est stunned
        const isStunned = (anim && anim.type === 'stunned');

        // Expression logic
        let eyeScaleY = 1;
        let eyeColor = '#fff';

        // Eye tracking (regarder l'adversaire)
        let lookX = 0, lookY = 0;
        if (this.network && playerState && playerState.id) {
            try {
                const state = this.network.getState();
                const opponentId = playerState.id === 'p1' ? 'p2' : 'p1';
                const opponent = state.players && state.players[opponentId];
                if (opponent && opponent.x !== undefined && opponent.y !== undefined) {
                    const dx = opponent.x - core.x;
                    const dy = opponent.y - core.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    lookX = (dx / dist) * 10;
                    lookY = (dy / dist) * 10;
                }
            } catch (e) {
                // Ignorer les erreurs de réseau
            }
        }

        if (playerState && playerState.victoryStance) {
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
            // Angry eyes on attack
            eyeScaleY = 0.5;
            lookY += 5;
        } else if (playerState && playerState.isHit) {
            // Shocked/Dead eyes
            eyeScaleY = 2.0;
            lookX = (Math.random() - 0.5) * 10;
            lookY = (Math.random() - 0.5) * 10;
        }

        // Standard Eyes Drawing
        if (eyeScaleY > 0) {
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';

            // Left Eye
            ctx.beginPath();
            ctx.ellipse(-15 + lookX * 0.3, -5 + lookY * 0.3, 6, 6 * eyeScaleY, 0, 0, Math.PI * 2);
            ctx.fill();

            // Right Eye
            ctx.beginPath();
            ctx.ellipse(15 + lookX * 0.3, -5 + lookY * 0.3, 6, 6 * eyeScaleY, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Dessine une main
     * hand est en position relative au contexte (core.x, core.y)
     */
    drawHand(hand, style) {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(hand.x || 0, hand.y || 0);
        ctx.fillStyle = style.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = style.glowColor;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Dessine main droite avec batte
     */
    drawHandWithBat(hand, batAngle, style, playerState = null, anim = null) {
        const ctx = this.ctx;

        // hand est toujours en position relative au contexte (core.x, core.y)
        ctx.save();
        ctx.translate(hand.x || 0, hand.y || 0);
        ctx.rotate(batAngle || 0);

        // Animation de frappe - Motion Swipe (seulement si pas en mode ragdoll actif)
        if (anim && anim.type === 'bat_swing') {
            const elapsed = Date.now() - anim.startTime;
            if (elapsed < anim.duration) {
                const progress = elapsed / anim.duration;
                if (progress >= 0.3 && progress < 0.35) {
                    // SMASH - Motion Swipe
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 40;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    const facing = playerState ? (playerState.facing || 1) : 1;
                    if (facing === 1) {
                        ctx.arc(0, 0, 70, -Math.PI / 2, Math.PI / 2, false);
                    } else {
                        ctx.arc(0, 0, 70, Math.PI + Math.PI / 2, Math.PI - Math.PI / 2, true);
                    }
                    ctx.stroke();
                    ctx.restore();
                } else if (progress >= 0.35 && progress < 0.6) {
                    // HOLD - Shockwave
                    ctx.save();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(0, 0, 50 + (progress - 0.35) * 200, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // Style batte (identique à l'actuel)
        ctx.fillStyle = '#eee';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;

        // Handle
        ctx.fillRect(-2, -5, 15, 6);

        // Bat body
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(80, -10);
        ctx.quadraticCurveTo(90, -5, 90, 0);
        ctx.quadraticCurveTo(90, 5, 80, 10);
        ctx.lineTo(10, 5);
        ctx.fill();

        ctx.restore();

        // Dessiner main par-dessus - Or en victory stance
        const handColor = (playerState && playerState.victoryStance) ? '#ffd700' : style.color;
        const handGlow = (playerState && playerState.victoryStance) ? '#ffd700' : style.glowColor;
        this.drawHand(hand, { color: handColor, glowColor: handGlow });
    }
}
