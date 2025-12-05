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
            btnAttack: document.getElementById('btn-attack'),
            btnDash: document.getElementById('btn-dash'),
            btnGrenade: document.getElementById('btn-grenade'),
            btnSlam: document.getElementById('btn-slam')
        };

        // Show on touch devices
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            touchControlsEl.style.display = 'flex';
            const controlsHint = document.getElementById('controls-hint');
            if (controlsHint) controlsHint.style.display = 'none';
        }

        this.setupJoystick();
        this.setupTouchButtons();
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

    // Setup touch buttons
    setupTouchButtons() {
        const { btnAttack, btnDash, btnGrenade, btnSlam } = this.touchControls;

        const setupButton = (btn, action) => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleAction(action);
                btn.style.transform = 'scale(0.9)';
            }, { passive: false });

            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                btn.style.transform = 'scale(1)';
            }, { passive: false });
        };

        setupButton(btnAttack, 'HIT');
        setupButton(btnDash, 'DASH');
        setupButton(btnGrenade, 'GRENADE');
        setupButton(btnSlam, 'SLAM');
    }
}
