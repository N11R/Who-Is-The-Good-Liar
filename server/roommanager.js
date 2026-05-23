'use strict';

// ─── IN-MEMORY STORE ──────────────────────────────────────────────────────────
const rooms = {};

// ─── GENERATE ROOM CODE ───────────────────────────────────────────────────────
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return rooms[code] ? generateCode() : code;
}

// ─── CREATE ROOM ──────────────────────────────────────────────────────────────
function createRoom(socketId, name, settings = {}) {
    const code = generateCode();

    const host = {
        id: socketId,
        socketId,
        name,
        number: 1,
        isHost: true,
        connected: true,
        round1Answers: null,
        round2Answers: null,
        assignedPlayerId: null,
        ratingsReceived: [],
        averageRating: 0,
    };

    rooms[code] = {
        code,
        hostId: socketId,
        phase: 'lobby',
        settings: {
            playerCount:     Math.min(Math.max(parseInt(settings.playerCount)     || 4, 3), 8),
            round1Questions: Math.min(Math.max(parseInt(settings.round1Questions) || 7, 5), 20),
            round2Questions: Math.min(Math.max(parseInt(settings.round2Questions) || 4, 3), 14),
            timerMinutes:    Math.min(Math.max(parseInt(settings.timerMinutes)    || 5, 2), 10),
        },
        players: [host],
        questions: { round1: [], round2: [] },
        identityMap: {},
        voting: { currentPlayerIndex: 0, votes: {}, guesses: {} },
        timerEnd: null,
        createdAt: Date.now(),
    };

    return { room: rooms[code], player: host };
}

// ─── JOIN ROOM ────────────────────────────────────────────────────────────────
function joinRoom(socketId, name, code) {
    const room = rooms[code];
    if (!room)                    return { error: 'Room not found. Check your code.' };
    if (room.phase !== 'lobby')   return { error: 'Game already in progress.' };
    if (room.players.length >= room.settings.playerCount)
        return { error: `Room is full (max ${room.settings.playerCount} players).` };

    const nameTaken = room.players.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (nameTaken)                return { error: 'That name is already taken in this room.' };

    const player = {
        id: socketId,
        socketId,
        name,
        number: room.players.length + 1,
        isHost: false,
        connected: true,
        round1Answers: null,
        round2Answers: null,
        assignedPlayerId: null,
        ratingsReceived: [],
        averageRating: 0,
    };

    room.players.push(player);
    return { room, player };
}

// ─── GETTERS ──────────────────────────────────────────────────────────────────
function getRoom(code) {
    return rooms[code] ?? null;
}

function getRoomBySocketId(socketId) {
    return Object.values(rooms).find(r => r.players.some(p => p.socketId === socketId)) ?? null;
}

// ─── REMOVE PLAYER (lobby only) ───────────────────────────────────────────────
function removePlayer(room, socketId) {
    room.players = room.players.filter(p => p.socketId !== socketId);
    room.players.forEach((p, i) => { p.number = i + 1; }); // re-number
}

// ─── DELETE / RESET ───────────────────────────────────────────────────────────
function deleteRoom(code) {
    delete rooms[code];
}

function resetRoom(room) {
    room.phase = 'lobby';
    room.identityMap = {};
    room.voting = { currentPlayerIndex: 0, votes: {}, guesses: {} };
    room.timerEnd = null;
    room.questions = { round1: [], round2: [] };
    room.players.forEach(p => {
        p.round1Answers = null;
        p.round2Answers = null;
        p.assignedPlayerId = null;
        p.ratingsReceived = [];
        p.averageRating = 0;
    });
}

// ─── ROOM SUMMARY (safe to send to clients — no answers, no identity map) ─────
function roomSummary(room) {
    return {
        code: room.code,
        hostId: room.hostId,
        phase: room.phase,
        settings: room.settings,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            number: p.number,
            isHost: p.id === room.hostId,
            connected: p.connected,
            submitted: p.round1Answers !== null,
        })),
    };
}

// ─── CLEANUP stale rooms every 30 min ─────────────────────────────────────────
setInterval(() => {
    const cutoff = Date.now() - 3 * 60 * 60 * 1000;
    Object.keys(rooms).forEach(code => {
        if (rooms[code].createdAt < cutoff) {
            delete rooms[code];
            console.log(`[cleanup] removed stale room ${code}`);
        }
    });
}, 30 * 60 * 1000);

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = { createRoom, joinRoom, getRoom, getRoomBySocketId, removePlayer, deleteRoom, resetRoom, roomSummary };
