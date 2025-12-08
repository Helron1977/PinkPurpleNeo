/**
 * Input Module
 * Handles keyboard and touch controls
 */

import { CONTROLS } from './constants.js';

export class InputManager {
    constructor(networkManager, soundManager) {
        this.network = networkManager;
        this.sound = soundManager;
        this.keys = {};
        this.touchControls = null;
        this.joystickActive = false;
        this.joystickCenter = { x: 0, y: 0 };
        this.joystickTouchId = null;
        this.lastJoystickAction = null;
    }

    // Setup keyboard controls
    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }

            if (this.keys[e.code]) return;
            this.keys[e.code] = true;

            const action = this.getActionFromKey(e.code);
            if (action) {
                this.handleAction(action);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    // Map key code to action
    getActionFromKey(code) {
        if (CONTROLS.LEFT.includes(code)) return 'LEFT';
        if (CONTROLS.RIGHT.includes(code)) return 'RIGHT';
        if (CONTROLS.UP.includes(code)) return 'UP';
        if (CONTROLS.DOWN && CONTROLS.DOWN.includes(code)) return 'DOWN'; // Ensure DOWN exists in constants
        if (['ArrowDown', 'KeyS'].includes(code)) return 'DOWN'; // Fallback
        if (CONTROLS.SLAM.includes(code)) return 'SLAM';
        if (CONTROLS.HIT.includes(code)) return 'HIT';
        if (CONTROLS.DASH.includes(code)) return 'DASH';
        if (CONTROLS.GRENADE.includes(code)) return 'GRENADE';
        if (CONTROLS.THREAD && CONTROLS.THREAD.includes(code)) return 'THREAD';
        if (CONTROLS.WEB && CONTROLS.WEB.includes(code)) return 'WEB';
        return null;
    }

    // Handle action (send to server + play sound)
    handleAction(action) {
        this.network.sendInput(action);

        // Local audio feedback
        if (action === 'UP') this.sound.playJump();
        if (action === 'DASH') this.sound.playDash();
        if (action === 'SLAM') this.sound.playNoise(0.2, 0.4);
        if (action === 'GRENADE') this.sound.playTone(400, 'square', 0.1, 0.1);
    }

    // Setup touch controls
    setupTouchControls() {
        const touchControlsEl = document.getElementById('touch-controls');
        if (!touchControlsEl) return;

        this.touchControls = {
            container: touchControlsEl,
            joystickZone: document.getElementById('joystick-zone'),
            joystickKnob: document.getElementById('joystick-knob'),
            actionJoystickZone: document.getElementById('action-joystick-zone'),
            actionJoystickKnob: document.getElementById('action-joystick-knob')
        };

        // Show on touch devices
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            touchControlsEl.style.display = 'flex';
            const controlsHint = document.getElementById('controls-hint');
            if (controlsHint) controlsHint.style.display = 'none';
        }

        this.setupJoystick();
        this.setupActionJoystick();
    }

    // Setup joystick
    setupJoystick() {
        const { joystickZone, joystickKnob } = this.touchControls;

        joystickZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.joystickTouchId = touch.identifier;
            this.joystickActive = true;
            this.lastJoystickAction = null;

            const rect = joystickZone.getBoundingClientRect();
            this.joystickCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            this.updateJoystick(touch);
        }, { passive: false });

        joystickZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.joystickActive) return;

            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystickTouchId) {
                    this.updateJoystick(e.changedTouches[i]);
                    break;
                }
            }
        }, { passive: false });

        joystickZone.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystickTouchId) {
                    this.resetJoystick();
                    break;
                }
            }
        }, { passive: false });
    }

    updateJoystick(touch) {
        const { joystickKnob } = this.touchControls;
        const maxDist = 50;
        const dx = touch.clientX - this.joystickCenter.x;
        const dy = touch.clientY - this.joystickCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const constrainedDist = Math.min(dist, maxDist);
        const moveX = (dx / dist) * constrainedDist;
        const moveY = (dy / dist) * constrainedDist;

        joystickKnob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

        let currentAction = null;

        if (dist > 15) {
            const absX = Math.abs(dx);
            const absY = Math.abs(dy);

            const horizontalThreshold = 20;
            const verticalThreshold = 25;

            if (absX > horizontalThreshold) {
                currentAction = dx > 0 ? 'RIGHT' : 'LEFT';
            } else if (dy < -verticalThreshold && absX < horizontalThreshold) {
                currentAction = 'UP';
            } else if (dy > verticalThreshold && absX < horizontalThreshold) {
                currentAction = 'DOWN';
            } else {
                const angle = Math.atan2(dy, dx);
                if (angle > -Math.PI / 3 && angle < Math.PI / 3) {
                    currentAction = 'RIGHT';
                } else if (angle > -2 * Math.PI / 3 && angle < -Math.PI / 3) {
                    currentAction = 'UP';
                } else if (angle > Math.PI / 3 && angle < 2 * Math.PI / 3) {
                    currentAction = 'DOWN';
                } else {
                    currentAction = 'LEFT';
                }
            }
        }

        if (currentAction !== this.lastJoystickAction) {
            if (currentAction) {
                this.handleAction(currentAction);
            }
            this.lastJoystickAction = currentAction;
        }
    }

    resetJoystick() {
        const { joystickKnob } = this.touchControls;
        this.joystickActive = false;
        this.joystickTouchId = null;
        this.lastJoystickAction = null;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
    }

    // Setup action joystick (6 secteurs pour les actions)
    setupActionJoystick() {
        const { actionJoystickZone, actionJoystickKnob } = this.touchControls;
        if (!actionJoystickZone) return;

        // Placement logique des actions :
        // - Centre : HIT (réactif immédiatement)
        // - Droite (0°) : DASH
        // - Haut (90°) : GRENADE
        // - Gauche (180°) : THREAD
        // - Bas-gauche (225°) : WEB
        // - Bas (270°) : SLAM
        this.actionJoystickActive = false;
        this.actionJoystickTouchId = null;
        this.lastActionJoystickAction = null;
        this.actionJoystickDirectionStartTime = null; // Pour le délai avant sélection d'une direction
        this.actionJoystickDirectionDelay = 150; // 150ms de délai avant de sélectionner une direction
        this.actionJoystickWasAtCenter = false; // Track si on était au centre

        actionJoystickZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.actionJoystickTouchId = touch.identifier;
            this.actionJoystickActive = true;
            this.lastActionJoystickAction = null;
            this.actionJoystickDirectionStartTime = null;

            const rect = actionJoystickZone.getBoundingClientRect();
            this.actionJoystickCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            // Calculer la distance initiale pour détecter si on est au centre
            const dx = touch.clientX - this.actionJoystickCenter.x;
            const dy = touch.clientY - this.actionJoystickCenter.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const centerRadius = 50 * 0.3; // 30% du rayon max pour le centre

            // Si on touche directement le centre, déclencher HIT immédiatement
            if (dist < centerRadius) {
                this.handleAction('HIT');
                actionJoystickKnob.textContent = '⚔️';
                this.actionJoystickWasAtCenter = true;
                this.lastActionJoystickAction = 'HIT';
            } else {
                // Sinon, démarrer le timer pour le délai de direction
                this.actionJoystickDirectionStartTime = Date.now();
                this.actionJoystickWasAtCenter = false;
            }

            this.updateActionJoystick(touch, actionJoystickKnob);
        }, { passive: false });

        actionJoystickZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.actionJoystickActive) return;

            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.actionJoystickTouchId) {
                    this.updateActionJoystick(e.changedTouches[i], actionJoystickKnob);
                    break;
                }
            }
        }, { passive: false });

        actionJoystickZone.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.actionJoystickTouchId) {
                    this.resetActionJoystick(actionJoystickKnob);
                    break;
                }
            }
        }, { passive: false });
    }

    updateActionJoystick(touch, knob) {
        const maxDist = 50;
        const dx = touch.clientX - this.actionJoystickCenter.x;
        const dy = touch.clientY - this.actionJoystickCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const constrainedDist = Math.min(dist, maxDist);
        const moveX = (dx / dist) * constrainedDist;
        const moveY = (dy / dist) * constrainedDist;

        knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

        let currentAction = null;
        let currentIcon = '⚔️';

        // Rayon du centre pour HIT (30% du rayon max)
        const centerRadius = maxDist * 0.3;
        
        if (dist < centerRadius) {
            // Au centre : HIT (réactif immédiatement, pas de délai)
            currentAction = 'HIT';
            currentIcon = '⚔️';
            // Réinitialiser le timer de direction si on revient au centre
            this.actionJoystickDirectionStartTime = null;
            this.actionJoystickWasAtCenter = true;
        } else if (dist > 20) {
            // Si on quitte le centre pour aller vers une direction, démarrer le timer
            if (this.actionJoystickWasAtCenter && !this.actionJoystickDirectionStartTime) {
                this.actionJoystickDirectionStartTime = Date.now();
            }
            // Si on n'a pas encore de timer (touché directement en direction), le démarrer
            if (!this.actionJoystickDirectionStartTime) {
                this.actionJoystickDirectionStartTime = Date.now();
            }
            this.actionJoystickWasAtCenter = false;
            
            // En direction : vérifier le délai avant de sélectionner
            const now = Date.now();
            
            // Vérifier si le délai est écoulé
            const timeSinceDirectionStart = now - this.actionJoystickDirectionStartTime;
            
            if (timeSinceDirectionStart >= this.actionJoystickDirectionDelay) {
                // Calculer l'angle (0° = droite, sens horaire)
                let angle = Math.atan2(dy, dx);
                // Normaliser entre 0 et 2π
                if (angle < 0) angle += 2 * Math.PI;
                
                // Convertir en degrés pour faciliter la logique
                const angleDeg = (angle * 180) / Math.PI;
                
                // Déterminer l'action selon l'angle (avec des zones spécifiques)
                // Droite (315-45°) : DASH
                // Haut (45-135°) : GRENADE
                // Gauche (135-225°) : THREAD
                // Bas-gauche (225-270°) : WEB
                // Bas (270-315°) : SLAM
                
                if (angleDeg >= 315 || angleDeg < 45) {
                    // Droite
                    currentAction = 'DASH';
                    currentIcon = '⚡';
                } else if (angleDeg >= 45 && angleDeg < 135) {
                    // Haut
                    currentAction = 'GRENADE';
                    currentIcon = '💣';
                } else if (angleDeg >= 135 && angleDeg < 225) {
                    // Gauche
                    currentAction = 'THREAD';
                    currentIcon = '🧵';
                } else if (angleDeg >= 225 && angleDeg < 270) {
                    // Bas-gauche
                    currentAction = 'WEB';
                    currentIcon = '🕸️';
                } else {
                    // Bas (270-315°)
                    currentAction = 'SLAM';
                    currentIcon = '⬇️';
                }
            } else {
                // Délai pas encore écoulé, ne pas sélectionner d'action
                // Mais afficher quand même l'icône prévue pour le feedback visuel
                let angle = Math.atan2(dy, dx);
                if (angle < 0) angle += 2 * Math.PI;
                const angleDeg = (angle * 180) / Math.PI;
                
                if (angleDeg >= 315 || angleDeg < 45) {
                    currentIcon = '⚡';
                } else if (angleDeg >= 45 && angleDeg < 135) {
                    currentIcon = '💣';
                } else if (angleDeg >= 135 && angleDeg < 225) {
                    currentIcon = '🧵';
                } else if (angleDeg >= 225 && angleDeg < 270) {
                    currentIcon = '🕸️';
                } else {
                    currentIcon = '⬇️';
                }
            }
        }

        // Mettre à jour l'icône du knob
        knob.textContent = currentIcon;

        // Déclencher l'action si elle a changé ET si le délai est respecté
        if (currentAction && currentAction !== this.lastActionJoystickAction) {
            this.lastActionJoystickAction = currentAction;
            this.handleAction(currentAction);
        }
    }

    resetActionJoystick(knob) {
        this.actionJoystickActive = false;
        this.lastActionJoystickAction = null;
        this.actionJoystickDirectionStartTime = null;
        this.actionJoystickWasAtCenter = false;
        knob.style.transform = 'translate(-50%, -50%)';
        knob.textContent = '⚔️';
    }
}
