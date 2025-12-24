/**
 * Audio System Module (Enhanced Neon/Synthwave Edition)
 * Handles all sound effects and background music with procedural synthesis.
 */

import { GAME_CONFIG } from './constants.js';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

export const soundManager = {
    bgMusicInterval: null,

    // --- SFX (Sound Effects) ---
    // Short, punchy, retro-futuristic sounds

    playTone: (freq, type, duration, vol = GAME_CONFIG.DEFAULT_VOLUME, time = null) => {
        const t = time || audioCtx.currentTime;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + duration);
    },

    playNoise: (duration, vol = 0.2, filterFreq = null) => {
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

        if (filterFreq) {
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            noise.connect(filter);
            filter.connect(gain);
        } else {
            noise.connect(gain);
        }

        gain.connect(audioCtx.destination);
        noise.start();
    },

    playJump: () => {
        // Sci-Fi "Whoosh" Up
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);

        // Lowpass filter sweep
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, audioCtx.currentTime);
        filter.frequency.linearRampToValueAtTime(2000, audioCtx.currentTime + 0.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    },

    playDash: () => {
        // Air compression sound
        soundManager.playNoise(0.2, 0.2, 800);
        soundManager.playTone(150, 'square', 0.1, 0.1); // Low square undertone
    },

    playBounce: () => {
        // Elastic "Boing"
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    },

    playHit: () => {
        // Punchy impact
        soundManager.playNoise(0.1, 0.4, 3000); // High freq snap
        soundManager.playTone(80, 'square', 0.15, 0.3); // Low body
    },

    playWin: () => {
        // Arpeggio flush
        [440, 554, 659, 880, 1108, 1318].forEach((f, i) => {
            setTimeout(() => soundManager.playTone(f, 'sawtooth', 0.8, 0.1), i * 80);
        });
    },

    // --- MUSIC GENERATOR (Extended Synthwave) ---
    cyberpunk: {
        isPlaying: false,
        timeoutId: null,
        nextNoteTime: 0,
        currentStep: 0,
        bar: 0,
        tempo: 128, // Classic Synthwave Tempo

        instruments: {
            kick(time) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.frequency.setValueAtTime(100, time);
                osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
                gain.gain.setValueAtTime(0.8, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(time);
                osc.stop(time + 0.5);
            },
            snare(time) {
                // Gated Snare feel (Noise + Low Tone + Reverb tail simulation via release)
                const noise = audioCtx.createBufferSource();
                const bufferSize = audioCtx.sampleRate * 0.25;
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
                noise.buffer = buffer;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 2000;

                const gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.4, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2); // Fast release (Gated)

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                noise.start(time);

                // Body
                const osc = audioCtx.createOscillator();
                const oscGain = audioCtx.createGain();
                osc.frequency.setValueAtTime(200, time);
                osc.frequency.linearRampToValueAtTime(100, time + 0.1);
                oscGain.gain.setValueAtTime(0.2, time);
                oscGain.gain.linearRampToValueAtTime(0, time + 0.15);
                osc.connect(oscGain);
                oscGain.connect(audioCtx.destination);
                osc.start(time);
                osc.stop(time + 0.15);
            },
            hihat(time, open = false) {
                const bufferSize = audioCtx.sampleRate * (open ? 0.3 : 0.05);
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
                const noise = audioCtx.createBufferSource();
                noise.buffer = buffer;
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.value = 7000;
                const gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.1, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + (open ? 0.2 : 0.05));
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                noise.start(time);
            },
            bass(freq, time, duration) {
                // Rolling Bassline (Sawtooth + Lowpass Filter Envelope)
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                const filter = audioCtx.createBiquadFilter();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, time);
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(freq * 3, time);
                filter.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.2); // Filter envelope
                gain.gain.setValueAtTime(0.25, time);
                gain.gain.linearRampToValueAtTime(0, time + duration);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(time);
                osc.stop(time + duration);
            },
            pad(freq, time, duration) {
                // Atmospheric Pad (Slow attack, long release)
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle'; // Mellower
                osc.frequency.setValueAtTime(freq, time);

                // LFO for movement
                const lfo = audioCtx.createOscillator();
                lfo.frequency.value = 2; // 2Hz wobble
                const lfoGain = audioCtx.createGain();
                lfoGain.gain.value = 5; // +/- 5Hz vibrato
                lfo.connect(lfoGain);
                lfoGain.connect(osc.frequency);
                lfo.start(time);
                lfo.stop(time + duration);

                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.05, time + duration * 0.3); // Slow attack
                gain.gain.linearRampToValueAtTime(0, time + duration);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(time);
                osc.stop(time + duration);
            },
            lead(freq, time, duration) {
                // Detuned Lead
                const create = (detune) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, time);
                    osc.detune.value = detune;
                    gain.gain.setValueAtTime(0.05, time);
                    gain.gain.linearRampToValueAtTime(0, time + duration);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(time);
                    osc.stop(time + duration);
                };
                create(-5);
                create(5);
            }
        },

        start() {
            if (this.isPlaying) return;
            this.isPlaying = true;
            this.nextNoteTime = audioCtx.currentTime + 0.1;
            this.currentStep = 0;
            this.bar = 0;
            this.schedule();
        },

        stop() {
            this.isPlaying = false;
            if (this.timeoutId) clearTimeout(this.timeoutId);
        },

        schedule() {
            if (!this.isPlaying) return;
            const lookahead = 0.1;
            while (this.nextNoteTime < audioCtx.currentTime + lookahead) {
                this.playStep(this.currentStep, this.nextNoteTime, this.bar);
                const secondsPerBeat = 60.0 / this.tempo;
                this.nextNoteTime += secondsPerBeat / 4; // 16th notes
                this.currentStep++;
                if (this.currentStep >= 16) {
                    this.currentStep = 0;
                    this.bar++;
                }
            }
            this.timeoutId = setTimeout(() => this.schedule(), 25);
        },

        playStep(step, time, bar) {
            // SONG STRUCTURE
            // Intro (Bar 0-7)
            // A Section (Bar 8-23)
            // Break (Bar 24-31)
            // B Section / Drop (Bar 32-64)
            // Loop back to 8

            const currentTotalBar = bar;
            if (currentTotalBar >= 64) {
                this.bar = 8; // Loop back to A Section
            }

            const isDrop = currentTotalBar >= 32 && currentTotalBar < 64;
            const isBreak = currentTotalBar >= 24 && currentTotalBar < 32;
            const isIntro = currentTotalBar < 8;

            // --- HARMONY (F# Minor Scale) ---
            // F#m - D - A - E
            let rootFreq = 46.25; // F#1
            let chord = [185.00, 220.00, 277.18]; // F#m (F#3, A3, C#4)

            const chordProgression = Math.floor(bar / 4) % 4; // Changes every 4 bars
            if (chordProgression === 0) { rootFreq = 46.25; chord = [185.00, 220.00, 277.18]; } // F#m
            else if (chordProgression === 1) { rootFreq = 36.71; chord = [146.83, 185.00, 220.00]; } // D
            else if (chordProgression === 2) { rootFreq = 55.00; chord = [220.00, 277.18, 329.63]; } // A
            else { rootFreq = 41.20; chord = [164.81, 207.65, 246.94]; } // E

            // --- DRUMS ---
            if (!isIntro || currentTotalBar >= 4) {
                // Kick: 4 on the floor
                if (step % 4 === 0) this.instruments.kick(time);

                // Snare: 5 and 13 (Standard Backbeat)
                if ((step === 4 || step === 12) && !isBreak) this.instruments.snare(time);

                // HiHats: 16th notes
                if (!isBreak) {
                    if (step % 2 === 0) this.instruments.hihat(time, step === 2 || step === 6 || step === 10 || step === 14); // Open logic on offbeats
                }
            }

            // --- BASS (Rolling 16ths) ---
            if (!isBreak && (currentTotalBar >= 8 || currentTotalBar >= 4)) {
                const duration = 60 / this.tempo / 4;
                // Octave Pattern: Root High Low Low
                let bassNote = rootFreq;
                if (step % 4 === 0) bassNote = rootFreq;
                else if (step % 4 === 2) bassNote = rootFreq * 2;
                else bassNote = rootFreq; // Simplified rolling

                this.instruments.bass(bassNote, time, duration * 0.8);
            }

            // --- PAD / CHORDS ---
            if (step === 0 && (isIntro || isBreak || isDrop)) {
                // Play full chord
                chord.forEach((note, i) => {
                    // Stagger slightly strum
                    this.instruments.pad(note, time + i * 0.05, 2.0); // Long sustain
                });
            }

            // --- LEAD / ARP ---
            if (isDrop || (currentTotalBar >= 16 && currentTotalBar < 24)) {
                const duration = 60 / this.tempo / 4;
                // Simple Arpeggiator pattern
                const arpNotes = [chord[0], chord[1], chord[2], chord[1] * 2]; // Up pattern
                const note = arpNotes[step % 4];

                // Rhythm: various patterns
                if (step % 2 === 0) {
                    this.instruments.lead(note * 2, time, duration * 0.5);
                }
            }
        }
    }
};

export { audioCtx };
