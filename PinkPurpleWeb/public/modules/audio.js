/**
 * Audio System Module
 * Handles all sound effects and background music
 */

import { GAME_CONFIG } from './constants.js';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

export const soundManager = {
    bgMusicInterval: null,

    playTone: (freq, type, duration, vol = GAME_CONFIG.DEFAULT_VOLUME) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },

    playNoise: (duration, vol = 0.2) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        noise.connect(gain);
        gain.connect(audioCtx.destination);
        noise.start();
    },

    playJump: () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    },

    playDash: () => {
        soundManager.playNoise(0.15, 0.2);
        soundManager.playTone(800, 'sawtooth', 0.1, 0.04);
    },

    playBounce: () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    },

    playHit: () => {
        soundManager.playNoise(0.3, 0.3);
        soundManager.playTone(100, 'square', 0.2, 0.15);
    },

    playWin: () => {
        [440, 554, 659, 880].forEach((f, i) => {
            setTimeout(() => soundManager.playTone(f, 'sine', 0.5, 0.2), i * 100);
        });
    },

    // Cyberpunk / Synthwave Generator
    cyberpunk: {
        isPlaying: false,
        timeoutId: null,
        nextNoteTime: 0,
        currentStep: 0,
        tempo: 135, // High Energy

        // Instruments
        playKick(time) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
            gain.gain.setValueAtTime(0.8, time); // Fort
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(time);
            osc.stop(time + 0.5);
        },

        playSnare(time) {
            // Noise burst
            const bufferSize = audioCtx.sampleRate * 0.2;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
            
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 1000;
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.4, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start(time);
            
            // Impact tone
            this.playTone(200, 'triangle', 0.1, 0.2, time); 
        },

        playHiHat(time) {
            const bufferSize = audioCtx.sampleRate * 0.05;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
            
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 5000;
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start(time);
        },

        playBassSynth(freq, time, duration) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();

            osc.type = 'sawtooth'; // Sawtooth pour le coté synthé gras
            osc.frequency.setValueAtTime(freq, time);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 4, time); // Filtre ouvert au début
            filter.frequency.exponentialRampToValueAtTime(freq, time + 0.2); // Fermeture rapide (Pluck)

            gain.gain.setValueAtTime(0.3, time);
            gain.gain.linearRampToValueAtTime(0, time + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(time);
            osc.stop(time + duration);
        },

        playLeadSynth(freq, time, duration) {
            // Deux oscillateurs légèrement désaccordés pour un effet "Chorus" riche
            const createOsc = (detune) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, time);
                osc.detune.value = detune;

                gain.gain.setValueAtTime(0.08, time);
                gain.gain.linearRampToValueAtTime(0, time + duration);

                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(time);
                osc.stop(time + duration);
            };

            createOsc(-5); // -5 cents
            createOsc(5);  // +5 cents
        },

        playArp(freq, time, duration) {
             const osc = audioCtx.createOscillator();
             const gain = audioCtx.createGain();
             osc.type = 'square';
             osc.frequency.setValueAtTime(freq, time);
             gain.gain.setValueAtTime(0.03, time);
             gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
             osc.connect(gain);
             gain.connect(audioCtx.destination);
             osc.start(time);
             osc.stop(time + duration);
        },

        // Helper
        playTone(freq, type, duration, vol, time) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(vol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(time);
            osc.stop(time + duration);
        }
    },

    startBgMusic: () => {
        if (soundManager.cyberpunk.isPlaying) return;
        soundManager.cyberpunk.isPlaying = true;
        soundManager.cyberpunk.nextNoteTime = audioCtx.currentTime + 0.1;
        soundManager.cyberpunk.currentStep = 0;

        const scheduler = () => {
            if (!soundManager.cyberpunk.isPlaying) return;

            while (soundManager.cyberpunk.nextNoteTime < audioCtx.currentTime + 0.1) {
                scheduleNote(soundManager.cyberpunk.currentStep, soundManager.cyberpunk.nextNoteTime);
                
                const secondsPerBeat = 60.0 / soundManager.cyberpunk.tempo;
                const secondsPer16th = secondsPerBeat / 4;
                soundManager.cyberpunk.nextNoteTime += secondsPer16th;
                
                soundManager.cyberpunk.currentStep++;
                if (soundManager.cyberpunk.currentStep >= 64) {
                    soundManager.cyberpunk.currentStep = 0;
                }
            }
            soundManager.cyberpunk.timeoutId = setTimeout(scheduler, 25);
        };

        const scheduleNote = (step, time) => {
            // Gamme: Ré Mineur (Dm) -> Futuriste/Action
            // Accords: Dm - Bb - F - C (i - VI - III - VII) - Progression épique
            let root;
            
            if (step < 16) root = 73.42; // D2 (Dm)
            else if (step < 32) root = 58.27; // Bb1 (Bb)
            else if (step < 48) root = 87.31; // F2 (F)
            else root = 65.41; // C2 (C)

            const stepInBar = step % 16;

            // --- DRUMS (Driving Beat) ---
            // Kick on 1, 5, 9, 13 (Four on the floor)
            if (stepInBar % 4 === 0) {
                soundManager.cyberpunk.playKick(time);
            }
            // Snare on 5 and 13 (Backbeat)
            if (stepInBar === 4 || stepInBar === 12) {
                soundManager.cyberpunk.playSnare(time);
            }
            // Hi-hats every off-beat or 16th
            if (step % 2 === 0) {
                if (stepInBar % 4 !== 0) soundManager.cyberpunk.playHiHat(time); // Off-beat open hat feel
            }

            // --- BASS (Rolling Bassline) ---
            // 16th notes bass
            const duration = 60 / soundManager.cyberpunk.tempo / 4;
            // Octave jump pattern (Root - Octave - Root - Octave)
            const bassFreq = (step % 2 === 0) ? root : root * 2;
            soundManager.cyberpunk.playBassSynth(bassFreq, time, duration);

            // --- ARP (Background Texture) ---
            // Arpège rapide sur les accords
            if (true) {
                let note;
                // Notes de l'accord courant
                let notes;
                if (step < 16) notes = [293.66, 349.23, 440.00]; // Dm (D4, F4, A4)
                else if (step < 32) notes = [233.08, 293.66, 349.23]; // Bb (Bb3, D4, F4)
                else if (step < 48) notes = [349.23, 440.00, 523.25]; // F (F4, A4, C5)
                else notes = [261.63, 329.63, 392.00]; // C (C4, E4, G4)

                note = notes[step % 3]; 
                soundManager.cyberpunk.playArp(note, time, duration);
            }

            // --- LEAD (Melody) ---
            // Mélodie plus éparse et percutante
            if (stepInBar === 0 || stepInBar === 3 || stepInBar === 6 || stepInBar === 10) {
                 // Pentatonique mineure de Ré
                 const melodyScale = [587.33, 698.46, 783.99, 880.00, 1046.50]; // D5, F5, G5, A5, C6
                 // Choix semi-aléatoire cohérent
                 const noteIdx = (Math.floor(step / 4) + (stepInBar===0?0:2)) % melodyScale.length;
                 const note = melodyScale[noteIdx];
                 
                 // Jouer seulement parfois pour laisser de l'espace
                 if (Math.random() > 0.2) {
                    soundManager.cyberpunk.playLeadSynth(note, time, 0.3);
                 }
            }
        };

        if (audioCtx.state === 'suspended') audioCtx.resume();
        scheduler();
    },

    stopBgMusic: () => {
        soundManager.cyberpunk.isPlaying = false;
        if (soundManager.cyberpunk.timeoutId) {
            clearTimeout(soundManager.cyberpunk.timeoutId);
            soundManager.cyberpunk.timeoutId = null;
        }
    }
};

export { audioCtx };
