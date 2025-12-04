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

    // Synthwave Music Generator
    synthwave: {
        isPlaying: false,
        oscillators: [],
        timeoutId: null,

        createPad(freq, startTime, duration) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, startTime);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(800, startTime);
            filter.Q.setValueAtTime(5, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.03, startTime + 0.1);
            gain.gain.setValueAtTime(0.03, startTime + duration - 0.2);
            gain.gain.linearRampToValueAtTime(0, startTime + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);

            return osc;
        },

        createBass(freq, startTime, duration) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0.15, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);

            return osc;
        },

        createArp(freq, startTime) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();

            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, startTime);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2000, startTime);

            gain.gain.setValueAtTime(0.04, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.2);

            return osc;
        }
    },

    startBgMusic: () => {
        if (soundManager.synthwave.isPlaying) return;
        soundManager.synthwave.isPlaying = true;

        const playLoop = () => {
            if (!soundManager.synthwave.isPlaying) return;

            const now = audioCtx.currentTime;
            const beatDuration = 0.5; // 120 BPM

            // Chord progression: Am - F - C - G (dreamy)
            const chords = [
                [220, 261.63, 329.63], // Am
                [174.61, 220, 261.63], // F
                [130.81, 164.81, 196],  // C
                [196, 246.94, 293.66]   // G
            ];

            chords.forEach((chord, i) => {
                const chordStart = now + (i * beatDuration * 4);

                // Pad
                chord.forEach(freq => {
                    soundManager.synthwave.createPad(freq, chordStart, beatDuration * 4);
                });

                // Bass
                for (let beat = 0; beat < 4; beat++) {
                    soundManager.synthwave.createBass(
                        chord[0] / 2,
                        chordStart + (beat * beatDuration),
                        beatDuration * 0.8
                    );
                }

                // Arp
                if (i % 2 === 0) {
                    for (let j = 0; j < 8; j++) {
                        const arpNote = chord[j % 3] * 2;
                        soundManager.synthwave.createArp(arpNote, chordStart + (j * beatDuration / 2));
                    }
                }
            });

            soundManager.synthwave.timeoutId = setTimeout(playLoop, 8000);
        };

        if (audioCtx.state === 'suspended') audioCtx.resume();
        playLoop();
    },

    stopBgMusic: () => {
        soundManager.synthwave.isPlaying = false;
        if (soundManager.synthwave.timeoutId) {
            clearTimeout(soundManager.synthwave.timeoutId);
            soundManager.synthwave.timeoutId = null;
        }
    }
};

export { audioCtx };
