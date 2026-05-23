'use strict';

// ─── CLIENT STATE ─────────────────────────────────────────────────────────────
const state = {
    socket: null,
    playerId: null,
    playerName: null,
    roomCode: null,
    isHost: false,
    myLiarGuess: null,

    // Round 1
    round1Questions: [],
    round1Answers: {},        // { questionIndex: "answer text" }

    // Round 2
    round2Questions: [],
    round2Answers: {},        // { questionIndex: "answer text" }
    assignedAnswers: null,    // The R1 answers handed to me (no name attached)

    // Voting
    currentVoteTarget: null,  // Player ID currently in the hot seat
    myVote: null,             // My current rating (0–5)
    isBeingEvaluated: false,  // Am I in the hot seat right now?

    // Timer
    timerInterval: null,
    timerEnd: null,
    reconnectAttempted: false,
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const roomFromURL = params.get('room');

    // If opening a shared room link, show join form instead of auto-rejoining host
    if (roomFromURL) {
        localStorage.removeItem('playerId');
        localStorage.removeItem('roomCode');
        localStorage.removeItem('playerName');

        connectSocket();

        checkURLForRoomCode();
        return;
    }

    // No room code in URL — clear old session so user starts fresh
    localStorage.removeItem('playerId');
    localStorage.removeItem('roomCode');
    localStorage.removeItem('playerName');

    connectSocket();
    checkURLForRoomCode();
});

// ─── SOCKET CONNECTION ────────────────────────────────────────────────────────
function connectSocket() {
    state.socket = io();

    // Reconnect to the same room after refresh
    state.socket.on('connect', () => {
        if (state.reconnectAttempted && state.playerId && state.roomCode) {
            state.socket.emit('rejoin-room', {
                playerId: state.playerId,
                code: state.roomCode,
                name: state.playerName
            });
        }
    });

    // ── Room events ──────────────────────────────────────────────────────────

    state.socket.on('room-created', ({ code, playerId, settings }) => {
        state.playerId = playerId;
        state.roomCode = code;
        state.isHost = true;

        localStorage.setItem('playerId', playerId);
        localStorage.setItem('roomCode', code);
        localStorage.setItem('playerName', state.playerName);

        renderLobby({ code, players: [{ id: playerId, name: state.playerName, number: 1, connected: true }], hostId: playerId, settings });
        showScreen('screen-lobby');
    });

    state.socket.on('room-joined', ({ playerId, playerNumber, room }) => {
        state.playerId = playerId;
        state.roomCode = room.code;
        state.isHost = false;

        localStorage.setItem('playerId', playerId);
        localStorage.setItem('roomCode', room.code);
        localStorage.setItem('playerName', state.playerName);

        renderLobby(room);
        showScreen('screen-lobby');
    });

    state.socket.on('room-rejoined', ({ playerId, room }) => {
        state.playerId = playerId;
        state.roomCode = room.code;
        state.isHost = room.hostId === playerId;

        renderLobby(room);
        showScreen('screen-lobby');
    });

    state.socket.on('player-list-update', ({ players, room }) => {
        renderLobby(room);
    });

    // ── Round 1 ──────────────────────────────────────────────────────────────

    state.socket.on('game-started', ({ round1Questions, timerEnd, room }) => {
        state.round1Questions = round1Questions;
        state.round1Answers = {};
        state.timerEnd = timerEnd;
        renderRound1(round1Questions);
        startCountdown(timerEnd, () => autoSubmitRound1());
        showScreen('screen-round1');
    });

    state.socket.on('round1-player-done', ({ doneCount, totalCount }) => {
        updateWaitCount('r1-wait-count', doneCount, totalCount);
        // Also update the wait screen progress bar
        const fill = document.getElementById('r1-wait-progress-fill');
        if (fill) fill.style.width = `${(doneCount / totalCount) * 100}%`;
    });

    // ── Round 2 ──────────────────────────────────────────────────────────────

    state.socket.on('round2-start', ({ assignedAnswers, round1Questions, round2Questions, timerEnd }) => {
        state.assignedAnswers = assignedAnswers;  // R1 answers from whoever I'm impersonating
        state.round2Questions = round2Questions;
        state.round2Answers = {};
        state.timerEnd = timerEnd;
        renderRound2(assignedAnswers, round1Questions, round2Questions);
        startCountdown(timerEnd, () => autoSubmitRound2());
        showScreen('screen-round2');
    });

    state.socket.on('round2-player-done', ({ doneCount, totalCount }) => {
        updateWaitCount('r2-wait-count', doneCount, totalCount);
        const fill = document.getElementById('r2-wait-progress-fill');
        if (fill) fill.style.width = `${(doneCount / totalCount) * 100}%`;
    });

    // ── Voting ───────────────────────────────────────────────────────────────

    state.socket.on('voting-start', ({ targetPlayerNumber, targetName, targetRound1, targetRound2, round1Questions, round2Questions, isBeingEvaluated, guessOptions }) => {
        state.currentVoteTarget = targetPlayerNumber;
        state.isBeingEvaluated = isBeingEvaluated;
        state.myVote = null;

        if (isBeingEvaluated) {
            // I'm in the hot seat — show waiting screen
            document.getElementById('hotseat-name').textContent = 'You are being evaluated.';
            document.getElementById('hotseat-sub').textContent = 'Sit tight while the others vote on you.';
            showScreen('screen-hotseat');
        } else {
            // I'm voting on someone else
            renderVoting(targetPlayerNumber, targetName, targetRound1, targetRound2, round1Questions, round2Questions, guessOptions);
            showScreen('screen-voting');
        }
    });

    state.socket.on('voting-collected', ({ nextTargetNumber }) => {
        // Server will immediately emit 'voting-start' for next player
        // Nothing to do here — just a heads up
    });

    // ── Reveal ───────────────────────────────────────────────────────────────

    state.socket.on('reveal-data', ({ players, round1Questions, round2Questions, identityMap, scores, guesses }) => {
        renderReveal(players, round1Questions, round2Questions, identityMap, scores, guesses);
        showScreen('screen-reveal');
    });

    // ── Winner ───────────────────────────────────────────────────────────────

    state.socket.on('winner-data', ({ winnerName, winnerNumber, score }) => {
        renderWinner(winnerName, winnerNumber, score);
        showScreen('screen-winner');
    });

    // ── Timer sync ───────────────────────────────────────────────────────────

    state.socket.on('timer-expired', ({ phase }) => {
        stopCountdown();
        if (phase === 'round1') autoSubmitRound1();
        if (phase === 'round2') autoSubmitRound2();
    });

    // ── Errors ───────────────────────────────────────────────────────────────

    state.socket.on('game-error', ({ message }) => {
        showError(message);
    });

    state.socket.on('game-reset', () => {
        resetState();
        showScreen('screen-landing');
    });
}

// ─── SCREEN MANAGEMENT ────────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);
}

// ─── URL ROOM CODE AUTO-FILL ──────────────────────────────────────────────────
function checkURLForRoomCode() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
        const input = document.getElementById('join-code');
        if (input) input.value = code.toUpperCase();

        const joinForm = document.getElementById('join-form');
        if (joinForm) joinForm.classList.remove('hidden');

        document.getElementById('btn-join-game')?.style.setProperty('display', 'none');
        document.getElementById('btn-new-game')?.style.setProperty('display', 'none');
    }
}

// ─── LANDING SCREEN ───────────────────────────────────────────────────────────
function showNewGameFlow() {
    showScreen('screen-setup');
}

function showJoinFlow() {
    const joinForm = document.getElementById('join-form');
    if (joinForm) joinForm.classList.remove('hidden');

    const joinBtn = document.getElementById('btn-join-game');
    const newBtn = document.getElementById('btn-new-game');

    if (joinBtn) joinBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = 'none';
}

// ─── HOST: CREATE ROOM ────────────────────────────────────────────────────────
function createRoom() {
    const name = document.getElementById('host-name-input').value.trim();
    const playerCount = parseInt(getSelected('player-count-options')) || 4;
    const round1Count = parseInt(getSelected('r1-count-options')) || 7;
    const round2Count = parseInt(getSelected('r2-count-options')) || 4;
    const timerMinutes = parseInt(document.getElementById('timer-slider').value) || 5;

    if (!name) return showError('Please enter your name.');
    if (name.length > 20) return showError('Name too long (max 20 chars).');

    state.playerName = name;

    state.socket.emit('create-room', {
        name,
        settings: { playerCount, round1Questions: round1Count, round2Questions: round2Count, timerMinutes }
    });
}

// ─── PLAYER: JOIN ROOM ────────────────────────────────────────────────────────
function joinRoom() {
    const name = document.getElementById('join-name-input').value.trim();
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();

    if (!name) return showError('Please enter your name.');
    if (code.length !== 4) return showError('Room code must be 4 characters.');

    state.playerName = name;
    state.socket.emit('join-room', { name, code });
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────
function renderLobby(room) {
    document.getElementById('lobby-room-code').textContent = room.code;

    // Build shareable link
    const link = `${window.location.origin}?room=${room.code}`;
    const linkEl = document.getElementById('lobby-share-link');
    if (linkEl) linkEl.value = link;

    // Player list
    const list = document.getElementById('lobby-player-list');
    list.innerHTML = '';
    room.players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-chip';
        div.innerHTML = `
      <span class="chip-num">P${p.number}</span>
      <span class="chip-name">${esc(p.name)}</span>
      ${p.id === room.hostId ? '<span class="chip-badge">HOST</span>' : ''}
    `;
        list.appendChild(div);
    });

    // Count
    const required = room.settings?.playerCount ?? 4;
    document.getElementById('lobby-count').textContent = `${room.players.length} / ${required} players`;

    // Host controls
    const startBtn = document.getElementById('start-game-btn');
    const hostControls = document.getElementById('host-controls');
    const guestMsg = document.getElementById('guest-waiting-msg');

    if (state.isHost) {
        if (hostControls) hostControls.style.display = 'block';
        if (guestMsg) guestMsg.style.display = 'none';
        if (startBtn) startBtn.disabled = room.players.length < required;
    } else {
        if (hostControls) hostControls.style.display = 'none';
        if (guestMsg) guestMsg.style.display = 'block';
    }
}

function copyLink() {
    const link = document.getElementById('lobby-share-link').value;
    navigator.clipboard?.writeText(link).catch(() => {});
    const btn = document.getElementById('copy-link-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = '📋 Copy', 1500); }
}

function startGame() {
    state.socket.emit('start-game', { roomCode: state.roomCode });
}

// ─── ROUND 1 — RENDER ALL QUESTIONS ──────────────────────────────────────────
function renderRound1(questions) {
    const container = document.getElementById('round1-questions');
    container.innerHTML = '';

    questions.forEach((q, i) => {
        const block = document.createElement('div');
        block.className = 'question-block';
        block.innerHTML = `
      <label class="question-label" for="r1-q${i}">Q${i + 1}. ${esc(q)}</label>
      <textarea
        class="answer-input"
        id="r1-q${i}"
        placeholder="Your answer..."
        maxlength="300"
        rows="2"
        oninput="saveR1Answer(${i}, this.value); updateR1Progress()"
      ></textarea>
    `;
        container.appendChild(block);
    });

    updateR1Progress();
}

function saveR1Answer(index, value) {
    state.round1Answers[index] = value.trim();
}

function updateR1Progress() {
    const total = state.round1Questions.length;
    const done = Object.values(state.round1Answers).filter(a => a && a.length > 0).length;
    const bar = document.getElementById('r1-progress-bar');
    const label = document.getElementById('r1-progress-label');
    if (bar) bar.style.width = `${(done / total) * 100}%`;
    if (label) label.textContent = `${done} / ${total} answered`;
    const btn = document.getElementById('r1-done-btn');
    if (btn) btn.disabled = done < total;
}

function submitRound1() {
    const answers = buildAnswersArray(state.round1Questions.length, state.round1Answers);
    // Don't stop countdown — keep timer visible on wait screen for other players
    state.socket.emit('submit-round1', { answers, roomCode: state.roomCode });
    showScreen('screen-round1-wait');
}

function autoSubmitRound1() {
    // Fill blanks with placeholder then submit
    state.round1Questions.forEach((_, i) => {
        if (!state.round1Answers[i]) state.round1Answers[i] = '(no answer)';
    });
    submitRound1();
}

// ─── ROUND 2 — SHOW ASSIGNED ANSWERS + NEW QUESTIONS ─────────────────────────
function renderRound2(assignedAnswers, round1Questions, round2Questions) {
    // Show the assigned person's Round 1 answers (NO name shown)
    const profileContainer = document.getElementById('assigned-profile');
    profileContainer.innerHTML = '';
    round1Questions.forEach((q, i) => {
        const item = document.createElement('div');
        item.className = 'profile-item';
        item.innerHTML = `
      <div class="profile-q">Q: ${esc(q)}</div>
      <div class="profile-a">"${esc(assignedAnswers[i] || '—')}"</div>
    `;
        profileContainer.appendChild(item);
    });

    // Render Round 2 questions
    const container = document.getElementById('round2-questions');
    container.innerHTML = '';
    round2Questions.forEach((q, i) => {
        const block = document.createElement('div');
        block.className = 'question-block';
        block.innerHTML = `
      <label class="question-label" for="r2-q${i}">Q${i + 1}. ${esc(q)}</label>
      <textarea
        class="answer-input"
        id="r2-q${i}"
        placeholder="Answer as them, not as you..."
        maxlength="300"
        rows="2"
        oninput="saveR2Answer(${i}, this.value); updateR2Progress()"
      ></textarea>
    `;
        container.appendChild(block);
    });

    updateR2Progress();
}

function saveR2Answer(index, value) {
    state.round2Answers[index] = value.trim();
}

function updateR2Progress() {
    const total = state.round2Questions.length;
    const done = Object.values(state.round2Answers).filter(a => a && a.length > 0).length;
    const bar = document.getElementById('r2-progress-bar');
    const label = document.getElementById('r2-progress-label');
    if (bar) bar.style.width = `${(done / total) * 100}%`;
    if (label) label.textContent = `${done} / ${total} answered`;
    const btn = document.getElementById('r2-done-btn');
    if (btn) btn.disabled = done < total;
}

function submitRound2() {
    const answers = buildAnswersArray(state.round2Questions.length, state.round2Answers);
    stopCountdown();
    state.socket.emit('submit-round2', { answers, roomCode: state.roomCode });
    document.getElementById('round2-wait-count').textContent = '';
    showScreen('screen-round2-wait');
}

function autoSubmitRound2() {
    state.round2Questions.forEach((_, i) => {
        if (!state.round2Answers[i]) state.round2Answers[i] = '(no answer)';
    });
    submitRound2();
}

// ─── VOTING — HOT SEAT ────────────────────────────────────────────────────────
function renderVoting(targetNumber, targetName, round1Answers, round2Answers, round1Questions, round2Questions, guessOption) {
    document.getElementById('voting-target-label').textContent =
        `Evaluating P${targetNumber}${targetName ? ' — ' + targetName : ''}`;

    // Round 1 answers (their own)
    const r1Container = document.getElementById('voting-round1');
    r1Container.innerHTML = '';
    round1Questions.forEach((q, i) => {
        const row = document.createElement('div');
        row.className = 'vote-answer-row';
        row.innerHTML = `
      <div class="vote-q">${esc(q)}</div>
      <div class="vote-a">"${esc(round1Answers[i] || '—')}"</div>
    `;
        r1Container.appendChild(row);
    });

    // Round 2 answers (what the impersonator wrote — no name yet)
    const r2Container = document.getElementById('voting-round2');
    r2Container.innerHTML = '';
    round2Questions.forEach((q, i) => {
        const row = document.createElement('div');
        row.className = 'vote-answer-row';
        row.innerHTML = `
      <div class="vote-q">${esc(q)}</div>
      <div class="vote-a impersonated">"${esc(round2Answers[i] || '—')}"</div>
    `;
        r2Container.appendChild(row);
    });

    // Reset star rating
    state.myVote = null;
    document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('selected'));
    document.getElementById('submit-vote-btn').disabled = true;
}

function selectStar(rating) {
    state.myVote = rating;
    // Highlight stars up to selected
    document.querySelectorAll('.star-btn').forEach((s, i) => {
        s.classList.toggle('selected', i < rating);
    });
    document.getElementById('submit-vote-btn').disabled = false;
}

function submitVote() {
    if (state.myVote === null) return;
    state.socket.emit('submit-vote', {
        targetId: state.currentVoteTarget,
        rating: state.myVote,
        roomCode: state.roomCode
    });
    // Show a mini wait message while others finish voting
    document.getElementById('submit-vote-btn').disabled = true;
    document.getElementById('submit-vote-btn').textContent = 'Vote submitted ✓';
}

// ─── REVEAL SCREEN ────────────────────────────────────────────────────────────
function renderReveal(players, round1Questions, round2Questions, identityMap, scores, guesses = {}) {
    const container = document.getElementById('reveal-grid');
    container.innerHTML = '';

    // Build lookup: for each player, who impersonated them?
    const impersonatorOf = {};
    players.forEach(player => {
        const impId = Object.keys(identityMap).find(k => identityMap[k] === player.id);
        impersonatorOf[player.id] = impId ? players.find(p => p.id === impId) : null;
    });

    // ── 1. Score summary cards ──
    const summaryEl = document.createElement('div');
    summaryEl.className = 'reveal-score-strip';
    players.forEach(player => {
        const imp = impersonatorOf[player.id];
        const impScore = imp ? (scores[imp.id] ?? 0) : 0;
        const card = document.createElement('div');
        card.className = 'reveal-score-card';
        card.innerHTML = `
          <div class="rsc-player">P${player.number} ${esc(player.name)}</div>
          <div class="rsc-arrow">impersonated by</div>
          <div class="rsc-imp">${imp ? `P${imp.number} ${esc(imp.name)}` : '?'}</div>
          <div class="rsc-score">${impScore.toFixed(1)}<span class="rsc-max"> / 5</span></div>
        `;
        summaryEl.appendChild(card);
    });
    container.appendChild(summaryEl);

    // ── 2. Round 1 — Question by question ──
    const r1Section = document.createElement('div');
    r1Section.className = 'reveal-round-section';
    r1Section.innerHTML = `<h3 class="reveal-round-heading reveal-round1-heading">Round 1 — Be Yourself</h3>`;

    round1Questions.forEach((q, qi) => {
        const qBlock = document.createElement('div');
        qBlock.className = 'reveal-q-block';
        qBlock.innerHTML = `
          <div class="reveal-q-header">
            <span class="reveal-q-num">Q${qi + 1}</span>
            <span class="reveal-q-text">${esc(q)}</span>
          </div>
          <div class="reveal-answers-grid">
            ${players.map(player => `
              <div class="reveal-answer-cell">
                <span class="rac-name">P${player.number} ${esc(player.name)}</span>
                <span class="rac-answer">"${esc(player.round1Answers?.[qi] || '—')}"</span>
              </div>
            `).join('')}
          </div>
        `;
        r1Section.appendChild(qBlock);
    });
    container.appendChild(r1Section);

    // ── 3. Round 2 — Question by question ──
    const r2Section = document.createElement('div');
    r2Section.className = 'reveal-round-section';
    r2Section.innerHTML = `<h3 class="reveal-round-heading reveal-round2-heading">Round 2 — The Impersonation</h3>`;

    round2Questions.forEach((q, qi) => {
        const qBlock = document.createElement('div');
        qBlock.className = 'reveal-q-block';
        qBlock.innerHTML = `
          <div class="reveal-q-header">
            <span class="reveal-q-num">Q${qi + 1}</span>
            <span class="reveal-q-text">${esc(q)}</span>
          </div>
          <div class="reveal-answers-grid">
            ${players.map(player => {
            const imp = impersonatorOf[player.id];
            return `
                <div class="reveal-answer-cell reveal-answer-imp">
                  <span class="rac-name">${imp ? `P${imp.number} ${esc(imp.name)}` : '?'}</span>
                  <span class="rac-as">answering as ${esc(player.name)}</span>
                  <span class="rac-answer">"${esc(imp?.round2Answers?.[qi] || '—')}"</span>
                </div>
              `;
        }).join('')}
          </div>
        `;
        r2Section.appendChild(qBlock);
    });
    container.appendChild(r2Section);

    // ── 4. Detective results — who guessed the liar correctly ──
    const detectiveSection = document.createElement('div');
    detectiveSection.className = 'detective-results';
    detectiveSection.innerHTML = '<h3 class="reveal-round-heading reveal-detective-heading">Who Guessed The Liar?</h3>';

    players.forEach(targetPlayer => {
        const impersonator = impersonatorOf[targetPlayer.id];
        const targetVotes = guesses?.[targetPlayer.number] ?? {};

        const card = document.createElement('div');
        card.className = 'detective-card';

        const rows = Object.entries(targetVotes).map(([voterId, guessedLiarId]) => {
            const voter = players.find(p => p.id === voterId);
            const guessed = players.find(p => p.id === guessedLiarId);
            const correct = impersonator && guessedLiarId === impersonator.id;

            return `
                <div class="detective-row ${correct ? 'correct' : 'wrong'}">
                    <span>${voter ? `P${voter.number} ${esc(voter.name)}` : 'Unknown player'}</span>
                    <span>guessed ${guessed ? `P${guessed.number} ${esc(guessed.name)}` : '—'} ${correct ? '✅' : '❌'}</span>
                </div>
            `;
        }).join('') || '<div class="detective-row">No guesses submitted.</div>';

        card.innerHTML = `
            <h4>P${targetPlayer.number} ${esc(targetPlayer.name)} was impersonated by ${impersonator ? `P${impersonator.number} ${esc(impersonator.name)}` : '?'}</h4>
            ${rows}
        `;

        detectiveSection.appendChild(card);
    });

    container.appendChild(detectiveSection);
}

function goToWinner() {
    state.socket.emit('request-winner', { roomCode: state.roomCode });
}

// ─── WINNER SCREEN ────────────────────────────────────────────────────────────
function renderWinner(name, number, score) {
    document.getElementById('winner-name').textContent = `P${number} — ${name}`;
    document.getElementById('winner-score').textContent = `${score.toFixed(1)} / 5`;
}

function startNewGame() {
    state.socket.emit('request-new-game', { roomCode: state.roomCode });
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function startCountdown(timerEnd, onExpire) {
    stopCountdown();
    state.timerEnd = timerEnd;

    const totalSeconds = Math.max(1, Math.floor((timerEnd - Date.now()) / 1000));

    function tick() {
        const remaining = Math.max(0, Math.floor((timerEnd - Date.now()) / 1000));
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        const display = `${min}:${sec.toString().padStart(2, '0')}`;
        const pct = (remaining / totalSeconds) * 100;

        // Update ALL timer text elements on every visible screen
        document.querySelectorAll('.timer-text').forEach(el => {
            el.textContent = `⏱ ${display}`;
        });

        // Update ALL timer fill bars
        document.querySelectorAll('.timer-fill').forEach(el => {
            el.style.width = `${pct}%`;
            if (remaining <= 30) {
                el.classList.add('danger');
            } else {
                el.classList.remove('danger');
            }
        });

        // Also update legacy .timer-display elements if any exist
        document.querySelectorAll('.timer-display').forEach(el => {
            el.textContent = `⏱ ${display} remaining`;
            if (remaining <= 30) el.classList.add('timer-urgent');
            else el.classList.remove('timer-urgent');
        });

        if (remaining <= 0) {
            stopCountdown();
            if (onExpire) onExpire();
        }
    }

    tick();
    state.timerInterval = setInterval(tick, 1000);
}

function stopCountdown() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function buildAnswersArray(length, answersObj) {
    return Array.from({ length }, (_, i) => answersObj[i] || '(no answer)');
}

function getSelected(groupClass) {
    const selected = document.querySelector(`.${groupClass} .option-btn.selected`);
    return selected ? selected.dataset.value : null;
}

function selectOption(btn, groupClass) {
    document.querySelectorAll(`.${groupClass} .option-btn`).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function updateWaitCount(elId, done, total) {
    const el = document.getElementById(elId);
    if (el) el.textContent = `${done} / ${total} players done`;
}

function showError(message) {
    // Try to find an error element on the current active screen
    const activeScreen = document.querySelector('.screen.active');
    const errEl = activeScreen?.querySelector('.error-msg');
    if (errEl) {
        errEl.textContent = message;
        setTimeout(() => errEl.textContent = '', 4000);
    } else {
        // Fallback: global toast
        let toast = document.getElementById('global-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'global-toast';
            toast.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:#f04d4d;color:#fff;font-family:monospace;font-size:0.8rem;padding:0.6rem 1.2rem;border-radius:8px;z-index:9999';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 4000);
    }
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function resetState() {
    stopCountdown();
    state.playerId = null;
    state.playerName = null;
    state.roomCode = null;
    state.isHost = false;
    state.round1Questions = [];
    state.round1Answers = {};
    state.round2Questions = [];
    state.round2Answers = {};
    state.assignedAnswers = null;
    state.currentVoteTarget = null;
    state.myVote = null;
    state.myLiarGuess = null;
    state.isBeingEvaluated = false;

    localStorage.removeItem('playerId');
    localStorage.removeItem('roomCode');
    localStorage.removeItem('playerName');
}




// ─── BUTTON WIRING — add this at the bottom of game.js ───────────────────────
window.addEventListener('DOMContentLoaded', () => {

    // Landing
    document.getElementById('btn-how-to-play')
        ?.addEventListener('click', () => {
            document.getElementById('how-to-play-modal')?.classList.remove('hidden');
        });

    document.getElementById('btn-close-how')
        ?.addEventListener('click', () => {
            document.getElementById('how-to-play-modal')?.classList.add('hidden');
        });

    document.getElementById('btn-new-game')
        ?.addEventListener('click', () => showScreen('screen-setup'));

    document.getElementById('btn-join-game')
        ?.addEventListener('click', () => {
            document.getElementById('join-form').classList.remove('hidden');
            document.getElementById('btn-join-game').style.display = 'none';
            document.getElementById('btn-new-game').style.display = 'none';
        });

    document.getElementById('btn-join-back')
        ?.addEventListener('click', () => {
            document.getElementById('join-form').classList.add('hidden');
            document.getElementById('btn-join-game').style.display = '';
            document.getElementById('btn-new-game').style.display = '';
        });

    document.getElementById('btn-setup-back')
        ?.addEventListener('click', () => showScreen('screen-landing'));

    // Setup — enable Create Game when name is filled
    document.getElementById('host-name')
        ?.addEventListener('input', function() {
            document.getElementById('btn-create-game').disabled = !this.value.trim();
        });

    // Setup — chip selectors
    document.querySelectorAll('.chip-select').forEach(group => {
        group.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                group.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
            });
        });
    });

    // Setup — timer slider label
    document.getElementById('timer-slider')
        ?.addEventListener('input', function() {
            document.getElementById('timer-value').textContent = `${this.value} min`;
        });

    // Setup — Create Game button
    document.getElementById('btn-create-game')
        ?.addEventListener('click', () => {
            const name = document.getElementById('host-name').value.trim();
            if (!name) return;

            const playerCount = parseInt(
                document.querySelector('#select-players .chip.selected')?.dataset.value
            ) || 4;
            const round1Count = parseInt(
                document.querySelector('#select-r1-questions .chip.selected')?.dataset.value
            ) || 7;
            const round2Count = parseInt(
                document.querySelector('#select-r2-questions .chip.selected')?.dataset.value
            ) || 4;
            const timerMinutes = parseInt(
                document.getElementById('timer-slider').value
            ) || 5;

            state.playerName = name;
            state.socket.emit('create-room', {
                name,
                settings: { playerCount, round1Questions: round1Count, round2Questions: round2Count, timerMinutes }
            });
        });

    // Join — enable Join button when name + code filled
    ['join-name', 'join-code'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            const name = document.getElementById('join-name').value.trim();
            const code = document.getElementById('join-code').value.trim();
            document.getElementById('btn-join-submit').disabled = !(name && code.length === 4);
        });
    });

    document.getElementById('join-code')
        ?.addEventListener('input', function() {
            this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });

    // Join — submit
    document.getElementById('btn-join-submit')
        ?.addEventListener('click', () => {
            const name = document.getElementById('join-name').value.trim();
            const code = document.getElementById('join-code').value.trim().toUpperCase();
            if (!name || code.length !== 4) return;
            state.playerName = name;
            state.socket.emit('join-room', { name, code });
        });

    // Lobby — copy link
    document.getElementById('btn-copy-link')
        ?.addEventListener('click', () => {
            const link = document.getElementById('lobby-link').value;
            navigator.clipboard?.writeText(link);
            const toast = document.getElementById('copy-toast');
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 1500);
        });

    // Lobby — start game
    document.getElementById('btn-start-game')
        ?.addEventListener('click', () => {
            state.socket.emit('start-game', { roomCode: state.roomCode });
        });

    // Round 1 — done button
    document.getElementById('btn-r1-done')
        ?.addEventListener('click', () => {
            const answers = state.round1Questions.map((_, i) => {
                return document.querySelector(`[data-index="${i}"]`)?.value.trim() || '(no answer)';
            });
            state.socket.emit('submit-round1', { answers, roomCode: state.roomCode });
            showScreen('screen-round1-wait');
        });

    // Round 2 — done button
    document.getElementById('btn-r2-done')
        ?.addEventListener('click', () => {
            const answers = state.round2Questions.map((_, i) => {
                return document.querySelector(`[data-r2-index="${i}"]`)?.value.trim() || '(no answer)';
            });
            state.socket.emit('submit-round2', { answers, roomCode: state.roomCode });
            showScreen('screen-round2-wait');
        });

    // Voting — star rating
    document.getElementById('star-rating')
        ?.addEventListener('click', (e) => {
            const star = e.target.closest('.star');
            if (!star) return;
            const rating = parseInt(star.dataset.value);
            state.myVote = rating;
            document.querySelectorAll('.star').forEach((s, i) => {
                s.classList.toggle('active', i < rating);
            });
            document.getElementById('rating-label').textContent = `${rating} star${rating > 1 ? 's' : ''}`;

            if (state.myLiarGuess !== null) {
                document.getElementById('btn-submit-vote').disabled = false;
            }
        });

    // Voting — submit vote
    document.getElementById('btn-submit-vote')
        ?.addEventListener('click', () => {
            if (state.myVote === null || state.myLiarGuess === null) return;
            state.socket.emit('submit-vote', {
                targetId: state.currentVoteTarget,
                rating: state.myVote,
                guessedLiarId: state.myLiarGuess,
                roomCode: state.roomCode
            });
            document.getElementById('btn-submit-vote').disabled = true;
            document.getElementById('btn-submit-vote').textContent = 'Vote submitted ✓';
        });

    // Reveal — see winner
    document.getElementById('btn-see-winner')
        ?.addEventListener('click', () => {
            state.socket.emit('request-winner', { roomCode: state.roomCode });
        });

    // Winner — new game
    document.getElementById('btn-new-game-restart')
        ?.addEventListener('click', () => {
            state.socket.emit('request-new-game', { roomCode: state.roomCode });
        });
});

// ─── RENDER LOBBY (matches your index.html IDs) ───────────────────────────────
function renderLobby(room) {
    if (!room) return;

    document.getElementById('lobby-room-code').textContent = room.code;

    const link = `${window.location.origin}?room=${room.code}`;
    const linkEl = document.getElementById('lobby-link');
    if (linkEl) linkEl.value = link;

    // QR code for easy phone joining
    const qrImg = document.getElementById('lobby-qr');
    const qrBox = document.getElementById('qr-box');
    if (qrImg && qrBox) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;
        qrBox.classList.remove('hidden');
    }

    const list = document.getElementById('lobby-player-list');
    if (list) {
        list.innerHTML = '';
        room.players.forEach(p => {
            const li = document.createElement('li');
            li.className = `player-item ${p.connected === false ? 'player-disconnected' : ''}`;
            li.innerHTML = `
                <span class="player-avatar">${esc((p.name || '?')[0]).toUpperCase()}</span>
                <span class="player-name">${esc(p.name)}</span>
                ${p.id === room.hostId ? '<span class="host-tag">HOST</span>' : ''}
                ${p.connected === false ? '<span class="disconnect-tag">OFFLINE</span>' : '<span class="ready-tag">READY ✓</span>'}
            `;
            list.appendChild(li);
        });
    }

    const required = room.settings?.playerCount ?? 4;
    const joined = room.players.length;
    const allIn = joined >= required;

    const countEl = document.getElementById('lobby-player-count');
    if (countEl) countEl.textContent = `${joined} / ${required}`;

    const readyBanner = document.getElementById('ready-banner');
    if (readyBanner) {
        readyBanner.classList.toggle('hidden', !allIn);
    }

    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
        startBtn.disabled = !state.isHost || !allIn;
        startBtn.textContent = allIn && state.isHost
            ? 'Start Game →'
            : `Waiting for players... (${joined}/${required})`;
    }
}

// ─── RENDER ROUND 1 () ────────────────────────────
function renderRound1(questions) {
    const container = document.getElementById('r1-questions');
    container.innerHTML = '';
    questions.forEach((q, i) => {
        const block = document.createElement('div');
        block.className = 'question-block';
        block.innerHTML = `
      <div class="question-block-inner">
        <span class="q-number">Q${i + 1}</span>
        <p class="q-text">${esc(q)}</p>
        <textarea class="q-answer" data-index="${i}" placeholder="Your answer..." rows="2" maxlength="300"></textarea>
      </div>
    `;
        container.appendChild(block);
    });

    // Update progress on typing
    container.addEventListener('input', () => {
        const filled = questions.filter((_, i) =>
            document.querySelector(`[data-index="${i}"]`)?.value.trim()
        ).length;
        document.getElementById('r1-progress').textContent = `${filled} / ${questions.length} answered`;
        document.getElementById('r1-progress-fill').style.width = `${(filled / questions.length) * 100}%`;
        document.getElementById('btn-r1-done').disabled = filled < questions.length;
    });
}

// ─── RENDER ROUND 2 (matches your index.html IDs) ────────────────────────────
function renderRound2(assignedAnswers, round1Questions, round2Questions) {
    // Show assigned profile
    const profileEl = document.getElementById('r2-profile-answers');
    if (profileEl) {
        profileEl.innerHTML = '';
        round1Questions.forEach((q, i) => {
            const div = document.createElement('div');
            div.className = 'profile-qa';
            div.innerHTML = `
        <span class="profile-q">${esc(q)}</span>
        <span class="profile-a">"${esc(assignedAnswers[i] || '—')}"</span>
      `;
            profileEl.appendChild(div);
        });
    }

    // Render R2 questions
    const container = document.getElementById('r2-questions');
    container.innerHTML = '';
    round2Questions.forEach((q, i) => {
        const block = document.createElement('div');
        block.className = 'question-block';
        block.innerHTML = `
      <div class="question-block-inner">
        <span class="q-number">Q${i + 1}</span>
        <p class="q-text">${esc(q)}</p>
        <textarea class="q-answer" data-r2-index="${i}" placeholder="Answer as them..." rows="2" maxlength="300"></textarea>
      </div>
    `;
        container.appendChild(block);
    });

    container.addEventListener('input', () => {
        const filled = round2Questions.filter((_, i) =>
            document.querySelector(`[data-r2-index="${i}"]`)?.value.trim()
        ).length;
        document.getElementById('r2-progress').textContent = `${filled} / ${round2Questions.length} answered`;
        document.getElementById('r2-progress-fill').style.width = `${(filled / round2Questions.length) * 100}%`;
        document.getElementById('btn-r2-done').disabled = filled < round2Questions.length;
    });
}

// ─── RENDER VOTING (matches your index.html IDs) ──────────────────────────────
function renderVoting(targetNumber, targetName, round1Answers, round2Answers, round1Questions, round2Questions, guessOptions = []) {
    document.getElementById('voting-title').textContent = `Evaluating P${targetNumber} — ${targetName}`;

    const r1El = document.getElementById('voting-r1-answers');
    r1El.innerHTML = '';
    round1Questions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'voting-qa';
        div.innerHTML = `<span class="voting-q">${esc(q)}</span><span class="voting-a">"${esc(round1Answers?.[i] || '—')}"</span>`;
        r1El.appendChild(div);
    });

    const r2El = document.getElementById('voting-r2-answers');
    r2El.innerHTML = '';
    round2Questions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'voting-qa';
        div.innerHTML = `<span class="voting-q">${esc(q)}</span><span class="voting-a">"${esc(round2Answers?.[i] || '—')}"</span>`;
        r2El.appendChild(div);
    });

    // Reset stars and liar guess
    document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
    document.getElementById('rating-label').textContent = 'Tap to rate';
    document.getElementById('btn-submit-vote').disabled = true;
    document.getElementById('btn-submit-vote').textContent = 'Submit Vote';
    state.myVote = null;
    state.myLiarGuess = null;

    // Guess the liar options
    const guessBox = document.getElementById('liar-guess-options');
    if (guessBox) {
        guessBox.innerHTML = '';

        if (!guessOptions || guessOptions.length === 0) {
            guessBox.innerHTML = '<p class="liar-guess-empty">No guess options available.</p>';
        } else {
            guessOptions.forEach(player => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'liar-guess-btn';
                btn.textContent = `P${player.number} — ${player.name}`;

                btn.addEventListener('click', () => {
                    state.myLiarGuess = player.id;

                    document.querySelectorAll('.liar-guess-btn').forEach(b => {
                        b.classList.remove('selected');
                    });

                    btn.classList.add('selected');

                    if (state.myVote !== null) {
                        document.getElementById('btn-submit-vote').disabled = false;
                    }
                });

                guessBox.appendChild(btn);
            });
        }
    }
}
