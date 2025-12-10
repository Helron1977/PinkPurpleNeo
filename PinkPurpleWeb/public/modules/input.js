import { CONTROLS } from './constants.js';

export class InputManager {
    constructor() {
        this.keys = {};
        this.touchInput = {
            up: false,
            down: false,
            left: false,
            right: false,
            action: null // 'HIT', 'SLAM', 'DASH', etc.
        };
        
        // --- 1. CONFIGURABLE CONTROLS ---
        this.activeControls = { ...CONTROLS };
        
        // Load custom controls from storage
        const saved = localStorage.getItem('player_controls');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.activeControls = { ...this.activeControls, ...parsed };
            } catch(e) { console.error('Error loading controls', e); }
        }

        // Listen for updates from SettingsManager
        window.addEventListener('controls_updated', (e) => {
            this.activeControls = e.detail;
        });

        this.setupKeyboard();
        this.setupActionJoystick(); // Right Joystick
        this.setupMovementJoystick(); // Left Joystick
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in an input field (Name, Code)
            if (e.target.tagName === 'INPUT') return;

            this.keys[e.code] = true;
            
            // Prevent scrolling for game keys
            const gameKeys = [
                ...this.activeControls.UP,
                ...this.activeControls.DOWN,
                ...this.activeControls.LEFT,
                ...this.activeControls.RIGHT,
                ...this.activeControls.HIT,
                'Space'
            ];
            
            if (gameKeys.includes(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    // --- LEFT JOYSTICK (Movement) ---
    setupMovementJoystick() {
        const zone = document.getElementById('joystick-zone');
        const knob = document.getElementById('joystick-knob');
        
        if (!zone || !knob) return;

        let startX, startY;
        
        const handleStart = (e) => {
            // e.preventDefault(); // Don't prevent default everywhere to allow scroll if needed? No, game needs focus.
            const touch = e.touches ? e.touches[0] : e;
            const rect = zone.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            startX = centerX;
            startY = centerY;
            this.updateJoystick(touch, knob, startX, startY, rect.width / 2);
        };

        const handleMove = (e) => {
            if (e.cancelable) e.preventDefault(); // Prevent scrolling on joystick
            const touch = e.touches ? e.touches[0] : e;
            this.updateJoystick(touch, knob, startX, startY, zone.offsetWidth / 2);
        };

        const handleEnd = (e) => {
            if (e.cancelable) e.preventDefault();
            knob.style.transform = `translate(-50%, -50%)`;
            this.touchInput.up = false;
            this.touchInput.down = false;
            this.touchInput.left = false;
            this.touchInput.right = false;
        };

        zone.addEventListener('touchstart', handleStart, { passive: false });
        zone.addEventListener('touchmove', handleMove, { passive: false });
        zone.addEventListener('touchend', handleEnd, { passive: false });
    }

    updateJoystick(touch, knob, startX, startY, maxDist) {
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
        const angle = Math.atan2(dy, dx);

        const moveX = Math.cos(angle) * dist;
        const moveY = Math.sin(angle) * dist;

        knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

        // Reset
        this.touchInput.up = false;
        this.touchInput.down = false;
        this.touchInput.left = false;
        this.touchInput.right = false;

        // Deadzone
        if (dist > 10) {
            // Priority to horizontal movement
            if (Math.abs(dx) > Math.abs(dy) * 0.5) {
                if (dx > 0) this.touchInput.right = true;
                else this.touchInput.left = true;
            }
            
            // Vertical check (independent)
            if (Math.abs(dy) > Math.abs(dx) * 0.5) {
                if (dy > 0) this.touchInput.down = true;
                else this.touchInput.up = true;
            }
        }
    }

    // --- RIGHT JOYSTICK (Actions) ---
    setupActionJoystick() {
        const zone = document.getElementById('action-joystick-zone');
        const knob = document.getElementById('action-joystick-knob');
        
        if (!zone || !knob) return;

        let startX, startY;
        this.actionJoystickDirectionStartTime = null;
        this.actionJoystickDirectionDelay = 150; // ms
        this.actionJoystickWasAtCenter = true;

        const actions = ['DASH', 'GRENADE', 'THREAD', 'WEB', 'SLAM', 'SLAM']; // 6 sectors
        const actionIcons = ['⚡', '💣', '🧵', '🕸️', '⬇️', '⬇️']; // Icons matching angles

        const handleStart = (e) => {
            const touch = e.touches ? e.touches[0] : e;
            const rect = zone.getBoundingClientRect();
            startX = rect.left + rect.width / 2;
            startY = rect.top + rect.height / 2;
            
            // Initial check for center tap (HIT)
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const centerRadius = rect.width * 0.3;

            if (dist < centerRadius) {
                this.touchInput.action = 'HIT';
                knob.textContent = '⚔️';
                this.actionJoystickWasAtCenter = true;
            } else {
                this.actionJoystickDirectionStartTime = Date.now();
                this.actionJoystickWasAtCenter = false;
            }

            this.updateActionJoystick(touch, knob, startX, startY, rect.width / 2, actions, actionIcons);
        };

        const handleMove = (e) => {
            if (e.cancelable) e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            this.updateActionJoystick(touch, knob, startX, startY, zone.offsetWidth / 2, actions, actionIcons);
        };

        const handleEnd = (e) => {
            if (e.cancelable) e.preventDefault();
            knob.style.transform = `translate(-50%, -50%)`;
            knob.textContent = '⚔️';
            this.touchInput.action = null; // Release action
            this.actionJoystickDirectionStartTime = null;
        };

        zone.addEventListener('touchstart', handleStart, { passive: false });
        zone.addEventListener('touchmove', handleMove, { passive: false });
        zone.addEventListener('touchend', handleEnd, { passive: false });
    }

    updateActionJoystick(touch, knob, startX, startY, maxDist, actions, actionIcons) {
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
        const angle = Math.atan2(dy, dx); // -PI to PI

        const moveX = Math.cos(angle) * dist;
        const moveY = Math.sin(angle) * dist;

        knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

        const centerRadius = maxDist * 0.3;

        if (dist < centerRadius) {
            // CENTER: HIT
            this.touchInput.action = 'HIT';
            knob.textContent = '⚔️';
            this.actionJoystickDirectionStartTime = null;
            this.actionJoystickWasAtCenter = true;
        } else {
            // SECTOR LOGIC
            if (this.actionJoystickWasAtCenter && !this.actionJoystickDirectionStartTime) {
                this.actionJoystickDirectionStartTime = Date.now();
            }
            this.actionJoystickWasAtCenter = false;

            // Determine sector
            // 0 is Right. PI/2 is Down. -PI/2 is Up. PI is Left.
            // We want: Right (0), Up (-PI/2), Left (PI), Down (PI/2) and diagonals
            
            // Normalize angle 0 to 2PI for easier math
            let normAngle = angle;
            if (normAngle < 0) normAngle += 2 * Math.PI;
            
            // 6 Sectors: 60 degrees each (PI/3)
            // Offset by 30 deg (PI/6) so Right is centered at 0
            const sectorIndex = Math.floor((normAngle + Math.PI / 6) / (Math.PI / 3)) % 6;
            
            // Check delay
            const now = Date.now();
            if (!this.actionJoystickDirectionStartTime) this.actionJoystickDirectionStartTime = now;
            
            if (now - this.actionJoystickDirectionStartTime >= this.actionJoystickDirectionDelay) {
                this.touchInput.action = actions[sectorIndex];
                knob.textContent = actionIcons[sectorIndex];
            } else {
                // Show intent but don't trigger yet
                knob.textContent = actionIcons[sectorIndex];
            }
        }
    }

    // --- MAIN API ---
    getInput() {
        let input = {
            up: false,
            down: false,
            left: false,
            right: false,
            slam: false,
            hit: false,
            dash: false,
            grenade: false,
            thread: false,
            web: false
        };

        // 1. Keyboard Configurable
        const check = (action) => {
            const keys = this.activeControls[action];
            return keys && keys.some(k => this.keys[k]);
        };

        if (check('UP')) input.up = true;
        if (check('DOWN')) input.down = true;
        if (check('LEFT')) input.left = true;
        if (check('RIGHT')) input.right = true;
        if (check('HIT')) input.hit = true;
        if (check('SLAM')) input.slam = true;
        if (check('DASH')) input.dash = true;
        if (check('GRENADE')) input.grenade = true;
        if (check('THREAD')) input.thread = true;
        if (check('WEB')) input.web = true;

        // 2. Touch (Merge)
        if (this.touchInput.up) input.up = true;
        if (this.touchInput.down) input.down = true;
        if (this.touchInput.left) input.left = true;
        if (this.touchInput.right) input.right = true;
        
        if (this.touchInput.action) {
            const act = this.touchInput.action;
            if (act === 'HIT') input.hit = true;
            else if (act === 'SLAM') input.slam = true;
            else if (act === 'DASH') input.dash = true;
            else if (act === 'GRENADE') input.grenade = true;
            else if (act === 'THREAD') input.thread = true;
            else if (act === 'WEB') input.web = true;
        }

        return input;
    }
}
