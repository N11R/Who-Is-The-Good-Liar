'use strict';

// ─── SHARED STATE ─────────────────────────────────────────────────────────────
const state = {
    socket:            null,
    playerId:          null,
    playerName:        null,
    roomCode:          null,
    isHost:            false,
    timerInterval:     null,
    timerEnd:          null,
    timerTotal:        0,
    round1Questions:   [],
    round2Questions:   [],
    assignedAnswers:   null,
    currentVoteTarget: null,
    myVote:            null,
    isBeingEvaluated:  false,
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    connectSocket();
    checkURLForRoomCode();
});

// ─── SOCKET ───────────────────────────────────────────────────────────────────
function connectSocket() {
    state.socket = io();

    // ── Lobby ──────────────────────────────────────────────────────────────────
    state.socket.on('room-created', ({ code, playerId, settings }) => {
        state.playerId = playerId;
        state.roomCode = code;
        state.isHost   = true;
        renderLobby({ code, hostId: playerId, players: [{ id: playerId, name: state.playerName, number: 1 }], settings });
        showScreen('screen-lobby');
    });

    state.socket.on('room-joined', ({ playerId, room }) => {
        state.playerId = playerId;
        state.roomCode = room.code;
        state.isHost   = false;
        renderLobby(room);
        showScreen('screen-lobby');
    });

    state.socket.on('player-list-update', ({ room }) => renderLobby(room));
    state.socket.on('player-left',        ({ room }) => renderLobby(room));

    // ── Round 1 ────────────────────────────────────────────────────────────────
    // Start countdown — keep it running even after player submits and hits wait screen
    state.socket.on('game-started', ({ round1Questions, timerEnd, room }) => {
        state.round1Questions = round1Questions;
        state.timerEnd        = timerEnd;
        state.timerTotal      = Math.round((timerEnd - Date.now()) / 1000);
        renderLobby(room);
        renderRound1(round1Questions);
        startCountdown(timerEnd, () => autoSubmit('round1'));
        showScreen('screen-round1');
    });

    state.socket.on('round1-player-done', ({ doneCount, totalCount }) => {
        setWaitProgress('r1', doneCount, totalCount);
    });

    // ── Round 2 ────────────────────────────────────────────────────────────────
    // Stop R1 countdown here (round is over), start R2 countdown
    state.socket.on('round2-start', ({ assignedAnswers, round1Questions, round2Questions, timerEnd }) => {
        stopCountdown(); // R1 is done — stop that timer
        state.assignedAnswers = assignedAnswers;
        state.round2Questions = round2Questions;
        state.timerEnd        = timerEnd;
        state.timerTotal      = Math.round((timerEnd - Date.now()) / 1000);
        renderRound2(assignedAnswers, round1Questions, round2Questions);
        startCountdown(timerEnd, () => autoSubmit('round2')); // R2 timer starts
        showScreen('screen-round2');
    });

    state.socket.on('round2-player-done', ({ doneCount, totalCount }) => {
        setWaitProgress('r2', doneCount, totalCount);
    });

    // ── Voting ─────────────────────────────────────────────────────────────────
    // R2 is done when voting starts — no timer needed in voting
    state.socket.on('voting-start', (data) => {
        stopCountdown(); // R2 is done — stop that timer
        state.currentVoteTarget = data.targetPlayerNumber;
        state.isBeingEvaluated  = data.isBeingEvaluated;
        state.myVote = null;
        renderVoting(data);
        showScreen('screen-voting');
    });

    // ── Reveal ─────────────────────────────────────────────────────────────────
    state.socket.on('reveal-data', ({ players, round1Questions, round2Questions, identityMap, scores }) => {
        renderReveal(players, round1Questions, round2Questions, identityMap, scores);
        showScreen('screen-reveal');
    });

    // ── Winner ─────────────────────────────────────────────────────────────────
    state.socket.on('winner-data', ({ winnerName, winnerNumber, score }) => {
        renderWinner(winnerName, winnerNumber, score);
        showScreen('screen-winner');
    });

    // ── Timer expired (server forced the round to end) ─────────────────────────
    state.socket.on('timer-expired', ({ phase }) => {
        stopCountdown();
        autoSubmit(phase);
    });

    // ── Errors / Reset ─────────────────────────────────────────────────────────
    state.socket.on('game-error', ({ message }) => showError(message));

    state.socket.on('game-reset', () => {
        resetState();
        showScreen('screen-landing');
    });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
}

function checkURLForRoomCode() {
    const code = new URLSearchParams(window.location.search).get('room');
    if (!code) return;
    const el = document.getElementById('join-code');
    if (el) el.value = code.toUpperCase();
    document.getElementById('join-form')?.classList.remove('hidden');
    if (document.getElementById('btn-new-game'))  document.getElementById('btn-new-game').style.display  = 'none';
    if (document.getElementById('btn-join-game')) document.getElementById('btn-join-game').style.display = 'none';
}

// Update wait screen player count + progress bar
function setWaitProgress(prefix, done, total) {
    const countEl = document.getElementById(`${prefix}-wait-count`);
    const fillEl  = document.getElementById(`${prefix}-wait-progress-fill`);
    if (countEl) countEl.textContent = `${done} / ${total} done`;
    if (fillEl)  fillEl.style.width  = `${Math.round((done / total) * 100)}%`;
}

function showError(message) {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;font-family:monospace;font-size:0.8rem;padding:0.6rem 1.2rem;border-radius:8px;z-index:9999';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function resetState() {
    stopCountdown();
    Object.assign(state, {
        playerId: null, playerName: null, roomCode: null, isHost: false,
        timerEnd: null, timerTotal: 0,
        round1Questions: [], round2Questions: [], assignedAnswers: null,
        currentVoteTarget: null, myVote: null, isBeingEvaluated: false,
    });
    ['host-name','join-name','join-code'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const createBtn = document.getElementById('btn-create-game');
    if (createBtn) createBtn.disabled = true;
    document.getElementById('join-form')?.classList.add('hidden');
    if (document.getElementById('btn-new-game'))  document.getElementById('btn-new-game').style.display  = '';
    if (document.getElementById('btn-join-game')) document.getElementById('btn-join-game').style.display = '';
}