/**
 * Game Constants
 * Centralized configuration for the game
 */

export const GAME_CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,

    // Player colors
    PLAYER1_COLOR: '#9393D6', // Violet
    PLAYER2_COLOR: '#CD62D5', // Pink

    // UI
    SCORE_CIRCLE_RADIUS: 80,
    TRAIL_LENGTH: 20,

    // Rendering
    PLAYER_RADIUS: 25,
    GRENADE_RADIUS: 8,

    // Audio
    DEFAULT_VOLUME: 0.1,
    MUSIC_NOTE_INTERVAL: 600, // ms
};

export const COLORS = {
    BACKGROUND: '#050510',
    GRID: 'rgba(0, 255, 255, 0.2)',
    CYAN: '#0ff',
    YELLOW: '#ff0',
    WHITE: '#fff',
    RED: 'rgba(255, 0, 0, 0.6)',
    BLACK_TRANSPARENT: 'rgba(0, 0, 0, 0.5)',
};

export const CONTROLS = {
    // Keyboard mappings
    LEFT: ['ArrowLeft', 'KeyA', 'KeyQ'],
    RIGHT: ['ArrowRight', 'KeyD'],
    UP: ['ArrowUp', 'KeyW', 'KeyZ'],
    DOWN: ['ArrowDown', 'KeyS'],
    SLAM: ['KeyE'],
    HIT: ['Space'],
    DASH: ['ShiftLeft', 'ShiftRight'],
    GRENADE: ['Digit0', 'Numpad0'],
    THREAD: ['ControlLeft', 'ControlRight'],
    WEB: ['KeyC'],
};
