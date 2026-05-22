'use strict';

// ─── SCREEN SWITCHER ──────────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    } else {
        console.warn(`[screens] screen not found: ${id}`);
    }
}

function currentScreen() {
    return document.querySelector('.screen.active')?.id ?? null;
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function renderLanding() {
    document.getElementById('panel-new-game').style.display = 'none';
    document.getElementById('panel-join-game').style.display = 'none';
}

function showNewGamePanel() {
    document.getElementById('panel-new-game').style.display = 'flex';
    document.getElementById('panel-join-game').style.display = 'none';
}

function showJoinPanel() {
    document.getElementById('panel-new-game').style.display = 'none';
    document.getElementById('panel-join-game').style.display = 'flex';
}

// ─── SETUP (host only) ────────────────────────────────────────────────────────
function renderSetup() {
    // Set defaults
    selectOptionBtn('player-count-options', '4');
    selectOptionBtn('r1-count-options', '7');
    selectOptionBtn('r2-count-options', '4');

    const slider = document.getElementById('timer-slider');
    const sliderLabel = document.getElementById('timer-slider-label');
    if (slider && sliderLabel) {
        slider.value = 5;
        sliderLabel.textContent = '5 min';
        slider.addEventListener('input', () => {
            sliderLabel.textContent = `${slider.value} min`;
        });
    }
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────
function renderLobby(room, myPlayerId, isHost) {
    // Room code
    document.getElementById('lobby-room-code').textContent = room.code;

    // Shareable link
    const link = `${window.location.origin}?room=${room.code}`;
    const linkInput = document.getElementById('lobby-share-link');
    if (linkInput) linkInput.value = link;

    // Player list
    const list = document.getElementById('lobby-player-list');
    list.innerHTML = '';
    room.players.forEach(p => {
        const chip = document.createElement('div');
        chip.className = `player-chip${p.connected === false ? ' disconnected' : ''}`;
        chip.innerHTML = `
      <span class="chip-num">P${p.number}</span>
      <span class="chip-name">${esc(p.name)}</span>
      ${p.id === room.hostId ? '<span class="chip-badge">HOST</span>' : ''}
      ${p.id === myPlayerId ? '<span class="chip-badge you-badge">YOU</span>' : ''}
    `;
        list.appendChild(chip);
    });

    // Player count
    const required = room.settings?.playerCount ?? 4;
    document.getElementById('lobby-count').textContent =
        `${room.players.length} / ${required} players`;

    // Host vs guest UI
    const hostControls = document.getElementById('host-controls');
    const guestMsg = document.getElementById('guest-waiting-msg');
    const startBtn = document.getElementById('start-game-btn');

    if (isHost) {
        if (hostControls) hostControls.style.display = 'block';
        if (guestMsg) guestMsg.style.display = 'none';
        if (startBtn) {
            const canStart = room.players.length >= (room.settings?.playerCount ?? 4);
            startBtn.disabled = !canStart;
            startBtn.textContent = canStart ? 'Start Game →' : `Waiting for players (${room.players.length}/${required})`;
        }
    } else {
        if (hostControls) hostControls.style.display = 'none';
        if (guestMsg) guestMsg.style.display = 'block';
    }
}

function renderCopyLink() {
    const btn = document.getElementById('copy-link-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const link = document.getElementById('lobby-share-link').value;
        navigator.clipboard?.writeText(link).catch(() => {});
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = '📋 Copy', 1500);
    });
}

// ─── ROUND 1 ──────────────────────────────────────────────────────────────────
function renderRound1Screen(questions) {
    const container = document.getElementById('round1-questions');
    container.innerHTML = '';

    questions.forEach((q, i) => {
        const block = document.createElement('div');
        block.className = 'question-block';
        block.innerHTML = `
      <label class="question-label" for="r1-q${i}">
        <span class="q-number">Q${i + 1}</span> ${esc(q)}
      </label>
      <textarea
        class="answer-input"
        id="r1-q${i}"
        placeholder="Your answer..."
        maxlength="300"
        rows="2"
      ></textarea>
    `;
        container.appendChild(block);
    });

    updateRound1Progress(questions.length, 0);

    // Attach change listeners
    questions.forEach((_, i) => {
        const ta = document.getElementById(`r1-q${i}`);
        if (ta) ta.addEventListener('input', () => onRound1Input(questions.length));
    });
}

function onRound1Input(total) {
    const done = countAnswered('r1-q', total);
    updateRound1Progress(total, done);
    const btn = document.getElementById('r1-done-btn');
    if (btn) btn.disabled = done < total;
}

function updateRound1Progress(total, done) {
    setProgressBar('r1-progress-bar', done, total);
    const label = document.getElementById('r1-progress-label');
    if (label) label.textContent = `${done} / ${total} answered`;
}

function getRound1Answers(total) {
    return Array.from({ length: total }, (_, i) => {
        const el = document.getElementById(`r1-q${i}`);
        return el?.value.trim() || '(no answer)';
    });
}

// ─── ROUND 1 WAIT ─────────────────────────────────────────────────────────────
function updateRound1WaitCount(done, total) {
    const el = document.getElementById('round1-wait-count');
    if (el) el.textContent = `${done} / ${total} players done`;
    setProgressBar('round1-wait-bar', done, total);
}

// ─── ROUND 2 ──────────────────────────────────────────────────────────────────
function renderRound2Screen(assignedAnswers, round1Questions, round2Questions) {
    // Show the mystery profile (no name — just their answers)
    const profileEl = document.getElementById('assigned-profile');
    profileEl.innerHTML = '';
    round1Questions.forEach((q, i) => {
        const item = document.createElement('div');
        item.className = 'profile-item';
        item.innerHTML = `
      <div class="profile-q">Q: ${esc(q)}</div>
      <div class="profile-a">"${esc(assignedAnswers[i] || '—')}"</div>
    `;
        profileEl.appendChild(item);
    });

    // Round 2 questions
    const container = document.getElementById('round2-questions');
    container.innerHTML = '';
    round2Questions.forEach((q, i) => {
        const block = document.createElement('div');
        block.className = 'question-block';
        block.innerHTML = `
      <label class="question-label" for="r2-q${i}">
        <span class="q-number">Q${i + 1}</span> ${esc(q)}
      </label>
      <textarea
        class="answer-input"
        id="r2-q${i}"
        placeholder="Answer as them, not as you..."
        maxlength="300"
        rows="2"
      ></textarea>
    `;
        container.appendChild(block);
    });

    updateRound2Progress(round2Questions.length, 0);

    round2Questions.forEach((_, i) => {
        const ta = document.getElementById(`r2-q${i}`);
        if (ta) ta.addEventListener('input', () => onRound2Input(round2Questions.length));
    });
}

function onRound2Input(total) {
    const done = countAnswered('r2-q', total);
    updateRound2Progress(total, done);
    const btn = document.getElementById('r2-done-btn');
    if (btn) btn.disabled = done < total;
}

function updateRound2Progress(total, done) {
    setProgressBar('r2-progress-bar', done, total);
    const label = document.getElementById('r2-progress-label');
    if (label) label.textContent = `${done} / ${total} answered`;
}

function getRound2Answers(total) {
    return Array.from({ length: total }, (_, i) => {
        const el = document.getElementById(`r2-q${i}`);
        return el?.value.trim() || '(no answer)';
    });
}

// ─── ROUND 2 WAIT ─────────────────────────────────────────────────────────────
function updateRound2WaitCount(done, total) {
    const el = document.getElementById('round2-wait-count');
    if (el) el.textContent = `${done} / ${total} players done`;
    setProgressBar('round2-wait-bar', done, total);
}

// ─── HOT SEAT (being evaluated) ───────────────────────────────────────────────
function renderHotSeat(targetNumber, progress) {
    const title = document.getElementById('hotseat-title');
    const sub = document.getElementById('hotseat-sub');
    const dots = document.getElementById('hotseat-progress');

    if (title) title.textContent = "You're in the hot seat.";
    if (sub) sub.textContent = `Others are voting on how well someone else captured you. Sit tight.`;
    if (dots) dots.textContent = `Player ${progress.current} of ${progress.total}`;
}

// ─── VOTING ───────────────────────────────────────────────────────────────────
function renderVotingScreen(data) {
    const { targetPlayerNumber, targetName, targetRound1, targetRound2, round1Questions, round2Questions, progress } = data;

    // Header
    document.getElementById('voting-target-label').textContent =
        `Rating P${targetPlayerNumber} — ${esc(targetName)}`;

    // Progress dots
    const dotsEl = document.getElementById('voting-progress-dots');
    if (dotsEl) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < progress.total; i++) {
            const dot = document.createElement('span');
            dot.className = `progress-dot${i < progress.current ? ' done' : i === progress.current - 1 ? ' active' : ''}`;
            dotsEl.appendChild(dot);
        }
    }

    // Round 1 answers (what they actually wrote)
    const r1El = document.getElementById('voting-round1');
    r1El.innerHTML = `<div class="voting-section-label">Their own answers (Round 1)</div>`;
    round1Questions.forEach((q, i) => {
        const row = document.createElement('div');
        row.className = 'vote-answer-row';
        row.innerHTML = `
      <div class="vote-q">${esc(q)}</div>
      <div class="vote-a">"${esc(targetRound1?.[i] || '—')}"</div>
    `;
        r1El.appendChild(row);
    });

    // Round 2 answers (what the impersonator wrote — name hidden)
    const r2El = document.getElementById('voting-round2');
    r2El.innerHTML = `<div class="voting-section-label impersonated-label">Someone's version of them (Round 2)</div>`;
    round2Questions.forEach((q, i) => {
        const row = document.createElement('div');
        row.className = 'vote-answer-row';
        row.innerHTML = `
      <div class="vote-q">${esc(q)}</div>
      <div class="vote-a impersonated">"${esc(targetRound2?.[i] || '—')}"</div>
    `;
        r2El.appendChild(row);
    });

    // Reset stars
    renderStars(0);
    const submitBtn = document.getElementById('submit-vote-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submit Vote';
    }
}

function renderStars(selected) {
    const container = document.getElementById('star-rating');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const btn = document.createElement('button');
        btn.className = `star-btn${i <= selected ? ' selected' : ''}`;
        btn.textContent = i <= selected ? '★' : '☆';
        btn.dataset.rating = i;
        btn.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
        btn.addEventListener('click', () => onStarClick(i));
        container.appendChild(btn);
    }
}

function onStarClick(rating) {
    renderStars(rating);
    const submitBtn = document.getElementById('submit-vote-btn');
    if (submitBtn) submitBtn.disabled = false;
    // Dispatch custom event so game.js can pick up the value
    document.dispatchEvent(new CustomEvent('star-selected', { detail: { rating } }));
}

function lockVoteSubmitted() {
    const btn = document.getElementById('submit-vote-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Vote submitted ✓';
    }
}

// ─── REVEAL ───────────────────────────────────────────────────────────────────
function renderRevealScreen(players, round1Questions, round2Questions, identityMap, scores) {
    const container = document.getElementById('reveal-grid');
    container.innerHTML = '';

    players.forEach(player => {
        const impersonatorId = Object.keys(identityMap).find(k => identityMap[k] === player.id);
        const impersonator = players.find(p => p.id === impersonatorId);
        const score = scores[impersonatorId]?.toFixed(1) ?? '—';

        const card = document.createElement('div');
        card.className = 'reveal-card';
        card.innerHTML = `
      <div class="reveal-card-header">
        <div class="reveal-player-info">
          <span class="reveal-player-num">P${player.number}</span>
          <span class="reveal-player-name">${esc(player.name)}</span>
        </div>
        <div class="reveal-score-badge">${score} / 5</div>
      </div>

      <div class="reveal-identity-line">
        Impersonated by
        <strong>P${impersonator?.number ?? '?'} — ${esc(impersonator?.name ?? 'Unknown')}</strong>
      </div>

      <div class="reveal-columns">
        <div class="reveal-col">
          <div class="reveal-col-header real-header">Round 1 — Their words</div>
          ${round1Questions.map((q, i) => `
            <div class="reveal-row">
              <div class="reveal-q">${esc(q)}</div>
              <div class="reveal-a">"${esc(player.round1Answers?.[i] || '—')}"</div>
            </div>
          `).join('')}
        </div>
        <div class="reveal-col">
          <div class="reveal-col-header impersonated-header">Round 2 — ${esc(impersonator?.name ?? '?')}'s version</div>
          ${round2Questions.map((q, i) => `
            <div class="reveal-row">
              <div class="reveal-q">${esc(q)}</div>
              <div class="reveal-a impersonated">"${esc(impersonator?.round2Answers?.[i] || '—')}"</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
        container.appendChild(card);
    });
}

// ─── WINNER ───────────────────────────────────────────────────────────────────
function renderWinnerScreen(name, number, score) {
    document.getElementById('winner-name').textContent = `P${number} — ${name}`;
    document.getElementById('winner-score').textContent = `${score.toFixed(1)} / 5`;
}

// ─── ERROR / TOAST ────────────────────────────────────────────────────────────
function showError(message) {
    const activeScreen = document.querySelector('.screen.active');
    const errEl = activeScreen?.querySelector('.error-msg');
    if (errEl) {
        errEl.textContent = message;
        setTimeout(() => { errEl.textContent = ''; }, 4000);
        return;
    }
    // Fallback global toast
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 4000);
}

// ─── OPTION BUTTON GROUPS ─────────────────────────────────────────────────────
// For player count, R1 count, R2 count selectors
function selectOptionBtn(groupId, value) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.option-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === String(value));
    });
}

function getSelectedOption(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return null;
    return group.querySelector('.option-btn.selected')?.dataset.value ?? null;
}

function initOptionGroups() {
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.closest('.option-group');
            if (!group) return;
            group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
}

// ─── SHARED UTILS ─────────────────────────────────────────────────────────────
function setProgressBar(barId, done, total) {
    const bar = document.getElementById(barId);
    if (bar) bar.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
}

function countAnswered(prefix, total) {
    let count = 0;
    for (let i = 0; i < total; i++) {
        const el = document.getElementById(`${prefix}${i}`);
        if (el?.value.trim()) count++;
    }
    return count;
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── AUTO-RUN ON LOAD ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    initOptionGroups();
    renderSetup();
    renderCopyLink();
});