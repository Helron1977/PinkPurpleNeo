/**
 * Network Module
 * Handles Socket.IO communication and binary protocol decoding
 */

import { GAME_CONFIG } from './constants.js';

export class NetworkManager {
    constructor(socket) {
        this.socket = socket;
        this.players = {};
        this.currentScores = { p1: 0, p2: 0 };
        this.grenades = [];
        this.explosions = [];
        this.eventHandlers = {};
    }

    // Register event handlers
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    // Emit custom events to registered handlers
    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(data));
        }
    }

    // Setup all socket listeners
    setupSocketListeners() {
        // Room creation
        this.socket.on('room_created', (roomId) => {
            this.socket.emit('join_room', roomId);
        });

        // Room joined
        this.socket.on('joined_room', (data) => {
            this.emit('joined_room', data);
        });

        // Errors
        this.socket.on('error', (msg) => {
            this.emit('error', msg);
        });

        this.socket.on('error_msg', (msg) => {
            this.emit('error', msg);
        });

        // Binary state updates (full state)
        this.socket.on('state_bin', (buf) => {
            this.decodeBinaryState(buf);
            this.emit('state_updated', {
                players: this.players,
                scores: this.currentScores,
                grenades: this.grenades
            });
        });

        // Delta state updates (positions only)
        this.socket.on('state_delta', (buf) => {
            this.decodeDeltaState(buf);
            this.emit('state_updated', {
                players: this.players,
                scores: this.currentScores,
                grenades: this.grenades
            });
        });

        // Game events
        this.socket.on('event', (event) => {
            this.handleGameEvent(event);
        });

        // Game over
        this.socket.on('game_over', (data) => {
            this.emit('game_over', data);
        });

        // Map updates
        this.socket.on('map_update', (obstacles) => {
            this.emit('map_update', obstacles);
        });

        // Player names update
        this.socket.on('update_names', (names) => {
            this.playerNames = names;
            this.emit('update_names', names);
        });

        // Ragdoll activation event
        this.socket.on('ragdoll_start', (data) => {
            this.emit('ragdoll_start', data);
        });
    }

    // Decode binary state protocol
    decodeBinaryState(buf) {
        const data = new Uint8Array(buf);
        let offset = 0;

        // 1. Scores
        this.currentScores = {
            p1: data[offset++],
            p2: data[offset++]
        };

        // Helper to read player
        const readPlayer = (playerId) => {
            const flags = data[offset++];
            const active = (flags & 1) !== 0;

            if (!active) {
                offset += 5;
                return null;
            }

            const isHit = (flags & 2) !== 0;
            const grenadeCount = (flags >> 2) & 0x03;
            const facing = (flags & 16) ? 1 : -1;
            const victoryStance = (flags & 32) !== 0; // Bit 5: VictoryStance
            const damage = data[offset++];

            // Read coordinates (Int16LE, scaled by 10) - EXACTEMENT comme l'ancien code
            const x = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;
            const y = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;

            // Convert to signed if needed
            const xSigned = x > 32767 / 10 ? x - 65536 / 10 : x;
            const ySigned = y > 32767 / 10 ? y - 65536 / 10 : y;

            return {
                x: xSigned,
                y: ySigned,
                damage: damage,
                isHit: isHit,
                grenadeCount: grenadeCount,
                facing: facing,
                victoryStance: victoryStance,
                color: playerId === 'p1' ? GAME_CONFIG.PLAYER1_COLOR : GAME_CONFIG.PLAYER2_COLOR
            };
        };

        // 2. Players
        this.players = {
            p1: readPlayer('p1'),
            p2: readPlayer('p2')
        };

        if (!this.players.p1) delete this.players.p1;
        if (!this.players.p2) delete this.players.p2;

        // 3. Grenades
        const grenadeCount = data[offset++];
        this.grenades = [];
        for (let i = 0; i < grenadeCount; i++) {
            const gx = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;
            const gy = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;
            const age = data[offset++];

            const gxSigned = gx > 32767 / 10 ? gx - 65536 / 10 : gx;
            const gySigned = gy > 32767 / 10 ? gy - 65536 / 10 : gy;

            this.grenades.push({
                x: gxSigned,
                y: gySigned,
                age: age
            });
        }
    }

    // Decode delta state protocol (positions only)
    decodeDeltaState(buf) {
        const data = new Uint8Array(buf);
        let offset = 0;

        // Read flags
        const flags = data[offset++];
        const p1Included = (flags & 1) !== 0;
        const p2Included = (flags & 2) !== 0;

        // Update P1 position if included
        if (p1Included && this.players.p1) {
            const x = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;
            const y = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;

            const xSigned = x > 32767 / 10 ? x - 65536 / 10 : x;
            const ySigned = y > 32767 / 10 ? y - 65536 / 10 : y;

            this.players.p1.x = xSigned;
            this.players.p1.y = ySigned;
        }

        // Update P2 position if included
        if (p2Included && this.players.p2) {
            const x = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;
            const y = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;

            const xSigned = x > 32767 / 10 ? x - 65536 / 10 : x;
            const ySigned = y > 32767 / 10 ? y - 65536 / 10 : y;

            this.players.p2.x = xSigned;
            this.players.p2.y = ySigned;
        }

        // Grenades (always included if present)
        const grenadeCount = data[offset++];
        this.grenades = [];
        for (let i = 0; i < grenadeCount; i++) {
            const gx = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;
            const gy = ((data[offset + 1] << 8) | data[offset]) / 10;
            offset += 2;
            const age = data[offset++];

            const gxSigned = gx > 32767 / 10 ? gx - 65536 / 10 : gx;
            const gySigned = gy > 32767 / 10 ? gy - 65536 / 10 : gy;

            this.grenades.push({
                x: gxSigned,
                y: gySigned,
                age: age
            });
        }
    }

    // Handle game events
    handleGameEvent(event) {
        if (event.type === 'grenade_explode') {
            this.explosions.push({
                x: event.x,
                y: event.y,
                radius: event.radius,
                age: 0
            });
        }

        this.emit('game_event', event);
    }

    // Send input to server
    sendInput(action) {
        this.socket.emit('input', action);
    }

    // Get current game state
    getState() {
        return {
            players: this.players,
            scores: this.currentScores,
            grenades: this.grenades,
            explosions: this.explosions,
            names: this.playerNames || { p1: 'P1', p2: 'P2' }
        };
    }
}
