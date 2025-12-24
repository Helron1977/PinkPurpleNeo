import { CONTROLS } from '../constants.js';

export class SettingsManager {
    constructor() {
        this.modal = document.getElementById('settings-modal');
        this.openBtn = document.getElementById('settings-btn');
        this.saveBtn = document.getElementById('settings-save-btn');
        this.resetBtn = document.getElementById('settings-reset-btn');
        this.listEl = document.getElementById('keys-list');
        this.hintsEl = document.getElementById('controls-hint');

        this.currentControls = JSON.parse(JSON.stringify(CONTROLS));

        // Load from storage
        const saved = localStorage.getItem('player_controls');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.currentControls = { ...this.currentControls, ...parsed };
            } catch (e) { console.error('Error loading controls', e); }
        }

        this.init();
        this.updateHints();
    }

    init() {
        if (!this.openBtn) return;

        this.openBtn.addEventListener('click', () => this.open());
        this.saveBtn.addEventListener('click', () => this.save());
        this.resetBtn.addEventListener('click', () => this.reset());

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    open() {
        this.renderList();
        this.modal.style.display = 'flex';
    }

    close() {
        this.modal.style.display = 'none';
        this.updateHints();
    }

    save() {
        localStorage.setItem('player_controls', JSON.stringify(this.currentControls));
        this.close();
        window.dispatchEvent(new CustomEvent('controls_updated', { detail: this.currentControls }));
    }

    reset() {
        this.currentControls = JSON.parse(JSON.stringify(CONTROLS));
        this.renderList();
    }

    renderList() {
        this.listEl.innerHTML = '';

        for (const [action, keys] of Object.entries(this.currentControls)) {
            const row = document.createElement('div');
            row.className = 'key-row';

            const label = document.createElement('span');
            label.className = 'key-action';
            label.innerText = action;

            const bindBtn = document.createElement('div');
            bindBtn.className = 'key-binding';
            // Show first key
            let displayKey = keys[0].replace('Key', '').replace('Digit', '');
            if (displayKey === ' ') displayKey = 'SPACE';
            bindBtn.innerText = displayKey;

            bindBtn.addEventListener('click', () => this.startBinding(action, bindBtn));

            row.appendChild(label);
            row.appendChild(bindBtn);
            this.listEl.appendChild(row);
        }
    }

    startBinding(action, btnElement) {
        btnElement.innerText = 'PRESS...';
        btnElement.classList.add('listening');

        const handler = (e) => {
            e.preventDefault();
            const code = e.code;

            this.currentControls[action] = [code];

            document.removeEventListener('keydown', handler);
            this.renderList();
        };

        document.addEventListener('keydown', handler, { once: true });
    }

    updateHints() {
        if (!this.hintsEl) return;

        const fk = (action) => {
            const keys = this.currentControls[action];
            if (!keys || keys.length === 0) return '?';
            return keys[0].replace('Key', '').replace('Digit', '').replace('Arrow', '').replace('Space', 'SPACE');
        };

        const hintHTML = `
            <div class="key"><span>${fk('UP')}/${fk('LEFT')}/${fk('DOWN')}/${fk('RIGHT')}</span> MOVE</div>
            <div class="key"><span>${fk('HIT')}</span> HIT</div>
            <div class="key"><span>${fk('SLAM')}</span> SLAM</div>
            <div class="key"><span>${fk('DASH')}</span> DASH</div>
            <div class="key"><span>${fk('GRENADE')}</span> BOMB</div>
            <div class="key"><span>${fk('THREAD')}</span> WIRE</div>
            <div class="key"><span>${fk('WEB')}</span> WEB</div>
        `;

        this.hintsEl.innerHTML = hintHTML;
    }
}

