import { GAME_CONFIG, CONTROLS } from '../constants.js';
import { PlayerRenderer } from '../renderers/PlayerRenderer.js';

export class TutorialManager {
    constructor() {
        this.modal = document.getElementById('tutorial-modal');
        this.canvas = document.getElementById('tutorial-canvas');
        
        if (!this.canvas) return; 
        
        this.ctx = this.canvas.getContext('2d');
        this.textEl = document.getElementById('tutorial-text');
        this.nextBtn = document.getElementById('tutorial-next-btn');
        this.closeBtn = document.getElementById('tutorial-close-btn');
        this.dontShowCheckbox = document.getElementById('tutorial-dont-show');
        this.openBtn = document.getElementById('tutorial-btn');

        // Create a dedicated renderer for the tutorial
        this.playerRenderer = new PlayerRenderer(this.ctx);
        
        // Load current controls
        this.controls = { ...CONTROLS };
        const saved = localStorage.getItem('player_controls');
        if (saved) {
            try {
                this.controls = { ...this.controls, ...JSON.parse(saved) };
            } catch(e) {}
        }
        
        // Listen for updates
        window.addEventListener('controls_updated', (e) => {
            this.controls = e.detail;
            if (this.currentStep !== -1) this.loadStep(this.currentStep); // Refresh text
        });

        // Helper to get key name
        this.getKey = (action) => {
            const keys = this.controls[action];
            if (!keys || keys.length === 0) return '?';
            return keys[0].replace('Key', '').replace('Digit', '').replace('Arrow', '').replace('Space', 'SPACE');
        };

        this.steps = [
            {
                getText: () => `${this.getKey('UP')}/${this.getKey('LEFT')}/${this.getKey('DOWN')}/${this.getKey('RIGHT')} to MOVE`,
                setup: (p) => { p.y = 150; p.x = 150; },
                update: (p, t) => { 
                    p.x = 150 + Math.sin(t * 0.05) * 80; 
                    p.facing = Math.cos(t * 0.05) > 0 ? 1 : -1;
                }
            },
            {
                getText: () => `${this.getKey('HIT')} to ATTACK`,
                setup: (p) => { p.x = 150; p.y = 150; },
                update: (p, t) => {
                    if (t % 60 === 0) {
                        this.playerRenderer.triggerAnimation('dummy', 'bat_swing', 300, { direction: 'right' });
                    }
                }
            },
            {
                getText: () => `MOVE UP then ${this.getKey('HIT')} for UPPERCUT`,
                setup: (p) => { p.x = 150; p.y = 200; },
                update: (p, t) => {
                    const cycle = t % 100;
                    if (cycle < 40) p.y -= 2; // Move UP
                    if (cycle === 40) {
                        this.playerRenderer.triggerAnimation('dummy', 'bat_swing', 300, { direction: 'up' });
                    }
                    if (cycle > 80) p.y = 200; // Reset
                }
            },
            {
                getText: () => `${this.getKey('SLAM')} to SLAM (Air Attack)`,
                setup: (p) => { p.x = 150; p.y = 100; },
                update: (p, t) => {
                    const cycle = t % 120;
                    if (cycle === 0) { p.y = 50; }
                    if (cycle < 20) { /* Hover */ }
                    else if (cycle < 30) { p.y += 10; } // Slam down
                    else if (cycle === 30) {
                        this.playerRenderer.triggerAnimation('dummy', 'deformation', 300);
                    }
                }
            },
            {
                getText: () => `${this.getKey('DASH')} to DASH`,
                setup: (p) => { p.x = 50; p.y = 150; },
                update: (p, t) => {
                    const cycle = t % 100;
                    if (cycle === 0) { p.x = 50; }
                    if (cycle > 30 && cycle < 50) { 
                        p.x += 15; 
                        p.trail = true;
                        // Add trail points manually for visual effect since PlayerRenderer usually does it in update loop based on pos change
                        // But here we are moving manually.
                    } else { 
                        p.trail = false; 
                    }
                }
            },
            {
                getText: () => `${this.getKey('GRENADE')} to Throw BOMB`,
                setup: (p) => { p.x = 100; p.y = 150; },
                update: (p, t) => {
                    // Simulate throw
                    if (t % 120 === 40) {
                         // Visual only
                    }
                    
                    // Draw a fake grenade
                    const cycle = t % 120;
                    if (cycle > 40 && cycle < 100) {
                        const progress = (cycle - 40) / 60;
                        const gx = 100 + progress * 150;
                        const gy = 150 - Math.sin(progress * Math.PI) * 100;
                        
                        this.ctx.save();
                        this.ctx.translate(gx, gy);
                        this.ctx.fillStyle = '#ff6600';
                        this.ctx.beginPath(); this.ctx.arc(0, 0, 8, 0, Math.PI*2); this.ctx.fill();
                        this.ctx.strokeStyle = '#000';
                        this.ctx.lineWidth = 2;
                        this.ctx.stroke();
                        // Pin blinking
                        if (Math.floor(t / 5) % 2 === 0) {
                            this.ctx.fillStyle = '#ff0000';
                            this.ctx.beginPath(); this.ctx.arc(3, -3, 3, 0, Math.PI*2); this.ctx.fill();
                        }
                        this.ctx.restore();
                    }
                }
            },
            {
                getText: () => `${this.getKey('THREAD')} for WIRE (Steal Size)`,
                setup: (p) => { p.x = 50; p.y = 150; },
                update: (p, t) => {
                    const cycle = t % 120;
                    // Shoot thread
                    if (cycle > 20 && cycle < 80) {
                        const progress = (cycle - 20) / 30;
                        const tx = 50 + Math.min(progress, 1) * 200;
                        const ty = 150;
                        
                        this.ctx.save();
                        this.ctx.strokeStyle = p.color;
                        this.ctx.lineWidth = 3;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p.x, p.y);
                        this.ctx.lineTo(tx, ty);
                        this.ctx.stroke();
                        this.ctx.fillStyle = p.color;
                        this.ctx.beginPath(); this.ctx.arc(tx, ty, 5, 0, Math.PI*2); this.ctx.fill();
                        this.ctx.restore();
                    }
                }
            },
            {
                getText: () => `${this.getKey('WEB')} for SPIDER WEB (Slow)`,
                setup: (p) => { p.x = 150; p.y = 150; },
                update: (p, t) => {
                    // Draw web on ground
                    const radius = 60 + Math.sin(t * 0.1) * 5;
                    this.ctx.save();
                    this.ctx.translate(150, 200);
                    this.ctx.scale(1, 0.5); // Perspective
                    
                    this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath(); this.ctx.arc(0, 0, radius, 0, Math.PI*2); this.ctx.stroke();
                    
                    // Web pattern
                    for(let i=0; i<8; i++) {
                        const angle = i * Math.PI/4;
                        this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(Math.cos(angle)*radius, Math.sin(angle)*radius); this.ctx.stroke();
                    }
                    
                    this.ctx.restore();
                }
            }
        ];

        this.currentStep = -1;
        this.animationId = null;
        this.dummyPlayer = {
            x: 150, y: 150,
            color: GAME_CONFIG.PLAYER1_COLOR,
            facing: 1,
            victoryStance: false,
            isRespawning: false
        };

        this.init();
    }

    init() {
        if (!this.nextBtn) return;

        this.nextBtn.addEventListener('click', () => this.nextStep());
        this.closeBtn.addEventListener('click', () => this.close());
        this.openBtn.addEventListener('click', () => this.start());

        if (!localStorage.getItem('tutorial_seen')) {
            // Optional: Auto-start
            // this.start();
        }
    }

    start() {
        this.modal.style.display = 'flex';
        this.currentStep = 0;
        this.loadStep(0);
        this.loop();
    }

    loadStep(index) {
        if (index >= this.steps.length) {
            this.close();
            return;
        }
        this.currentStep = index;
        const step = this.steps[index];
        this.textEl.innerText = step.getText ? step.getText() : step.text;
        
        // Reset Dummy
        this.dummyPlayer = {
            x: 150, y: 150,
            color: GAME_CONFIG.PLAYER1_COLOR,
            facing: 1,
            victoryStance: false,
            isRespawning: false
        };
        // Reset animation state
        this.playerRenderer.playerAnims['dummy'] = undefined;
        this.playerRenderer.trails['dummy'] = []; 
        
        if (step.setup) step.setup(this.dummyPlayer);

        if (index === this.steps.length - 1) {
            this.nextBtn.style.display = 'none';
            this.closeBtn.style.display = 'inline-block';
        } else {
            this.nextBtn.style.display = 'inline-block';
            this.closeBtn.style.display = 'none';
        }
    }

    nextStep() {
        this.loadStep(this.currentStep + 1);
    }

    close() {
        this.modal.style.display = 'none';
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
        this.currentStep = -1;
        
        if (this.dontShowCheckbox.checked) {
            localStorage.setItem('tutorial_seen', 'true');
        }
    }

    loop() {
        if (this.modal.style.display === 'none') return;

        // Clear canvas
        this.ctx.clearRect(0, 0, 300, 300);
        
        // Draw grid bg
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, 300, 300);
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        for(let i=0; i<300; i+=30) { this.ctx.moveTo(i,0); this.ctx.lineTo(i,300); this.ctx.moveTo(0,i); this.ctx.lineTo(300,i); }
        this.ctx.stroke();

        // Update logic
        const step = this.steps[this.currentStep];
        if (step && step.update) {
            step.update(this.dummyPlayer, this.playerRenderer.frameCounter);
        }

        this.playerRenderer.update(this.playerRenderer.frameCounter + 1);
        
        // Mock State
        const mockState = { players: { 'dummy': this.dummyPlayer } };
        
        // Draw Player
        this.ctx.save();
        // PlayerRenderer usually translates to p.x, p.y.
        // We ensure dummyPlayer coordinates are within 0-300 canvas space.
        this.playerRenderer.drawPlayerModel(this.dummyPlayer, 'dummy', mockState);
        this.ctx.restore();

        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
