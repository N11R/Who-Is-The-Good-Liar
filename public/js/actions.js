'use strict';

// ─── BUTTON WIRING ────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {

    // Landing — New Game
    document.getElementById('btn-new-game')
        ?.addEventListener('click', () => showScreen('screen-setup'));

    // Landing — Join Room
    document.getElementById('btn-join-game')
        ?.addEventListener('click', () => {
            document.getElementById('join-form').classList.remove('hidden');
            document.getElementById('btn-new-game').style.display  = 'none';
            document.getElementById('btn-join-game').style.display = 'none';
        });

    document.getElementById('btn-join-back')
        ?.addEventListener('click', () => {
            document.getElementById('join-form').classList.add('hidden');
            document.getElementById('btn-new-game').style.display  = '';
            document.getElementById('btn-join-game').style.display = '';
        });

    // Setup — back
    document.getElementById('btn-setup-back')
        ?.addEventListener('click', () => showScreen('screen-landing'));

    // Setup — enable Create Game when name typed
    document.getElementById('host-name')
        ?.addEventListener('input', function () {
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
        ?.addEventListener('input', function () {
            document.getElementById('timer-value').textContent = `${this.value} min`;
        });

    // Setup — Create Game
    document.getElementById('btn-create-game')
        ?.addEventListener('click', () => {
            const name = document.getElementById('host-name').value.trim();
            if (!name) return showError('Please enter your name.');

            const playerCount  = parseInt(document.querySelector('#select-players .chip.selected')?.dataset.value)      || 4;
            const round1Count  = parseInt(document.querySelector('#select-r1-questions .chip.selected')?.dataset.value) || 7;
            const round2Count  = parseInt(document.querySelector('#select-r2-questions .chip.selected')?.dataset.value) || 4;
            const timerMinutes = parseInt(document.getElementById('timer-slider')?.value)                                || 5;

            state.playerName = name;
            state.socket.emit('create-room', {
                name,
                settings: { playerCount, round1Questions: round1Count, round2Questions: round2Count, timerMinutes }
            });
        });

    // Join — enable submit when name + 4-char code filled
    ['join-name', 'join-code'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            const name = document.getElementById('join-name')?.value.trim();
            const code = document.getElementById('join-code')?.value.trim();
            document.getElementById('btn-join-submit').disabled = !(name && code.length === 4);
        });
    });

    // Join — force uppercase code
    document.getElementById('join-code')
        ?.addEventListener('input', function () {
            this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });

    // Join — submit
    document.getElementById('btn-join-submit')
        ?.addEventListener('click', () => {
            const name = document.getElementById('join-name')?.value.trim();
            const code = document.getElementById('join-code')?.value.trim().toUpperCase();
            if (!name || code.length !== 4) return;
            state.playerName = name;
            state.socket.emit('join-room', { name, code });
        });

    // Lobby — copy link
    document.getElementById('btn-copy-link')
        ?.addEventListener('click', () => {
            navigator.clipboard?.writeText(document.getElementById('lobby-link')?.value);
            const toast = document.getElementById('copy-toast');
            if (toast) {
                toast.classList.remove('hidden');
                setTimeout(() => toast.classList.add('hidden'), 1500);
            }
        });

    // Lobby — start game (host only)
    document.getElementById('btn-start-game')
        ?.addEventListener('click', () => {
            state.socket.emit('start-game', { roomCode: state.roomCode });
        });

    // Round 1 — Done
    document.getElementById('btn-r1-done')
        ?.addEventListener('click', () => submitRound1());

    // Round 2 — Done
    document.getElementById('btn-r2-done')
        ?.addEventListener('click', () => submitRound2());

    // Round 2 — Hide / Show profile toggle
    document.getElementById('btn-hide-profile')
        ?.addEventListener('click', () => {
            const profile = document.getElementById('r2-profile-answers');
            const btn     = document.getElementById('btn-hide-profile');
            if (!profile || !btn) return;
            const isHidden = profile.style.display === 'none';
            profile.style.display = isHidden ? '' : 'none';
            btn.textContent = isHidden ? 'Hide Profile ▲' : 'Show Profile ▼';
        });

    // Voting — star click
    document.getElementById('star-rating')
        ?.addEventListener('click', (e) => {
            const star = e.target.closest('.star');
            if (!star) return;
            const rating = parseInt(star.dataset.value);
            state.myVote = rating;
            document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('active', i < rating));
            document.getElementById('rating-label').textContent = `${rating} star${rating > 1 ? 's' : ''}`;
            document.getElementById('btn-submit-vote').disabled = false;
        });

    // Voting — submit vote
    document.getElementById('btn-submit-vote')
        ?.addEventListener('click', () => {
            if (state.myVote === null) return;
            state.socket.emit('submit-vote', {
                targetId: state.currentVoteTarget,
                rating:   state.myVote,
                roomCode: state.roomCode
            });
            document.getElementById('btn-submit-vote').disabled    = true;
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

// ─── SUBMIT ACTIONS ───────────────────────────────────────────────────────────
function submitRound1() {
    const answers = state.round1Questions.map((_, i) =>
        document.querySelector(`[data-index="${i}"]`)?.value.trim() || '(no answer)'
    );
    state.socket.emit('submit-round1', { answers, roomCode: state.roomCode });
    showScreen('screen-round1-wait');
    // Restart countdown so wait screen timer keeps ticking
    if (state.timerEnd) startCountdown(state.timerEnd, () => {});
}

function submitRound2() {
    const answers = state.round2Questions.map((_, i) =>
        document.querySelector(`[data-r2-index="${i}"]`)?.value.trim() || '(no answer)'
    );
    state.socket.emit('submit-round2', { answers, roomCode: state.roomCode });
    showScreen('screen-round2-wait');
    // Restart countdown so wait screen timer keeps ticking
    if (state.timerEnd) startCountdown(state.timerEnd, () => {});
}

function autoSubmit(phase) {
    if (phase === 'round1') submitRound1();
    if (phase === 'round2') submitRound2();
}

// ─── RENDER FUNCTIONS ─────────────────────────────────────────────────────────
function renderLobby(room) {
    document.getElementById('lobby-room-code').textContent = room.code;

    const linkEl = document.getElementById('lobby-link');
    if (linkEl) linkEl.value = `${window.location.origin}?room=${room.code}`;

    const list = document.getElementById('lobby-player-list');
    if (list) {
        list.innerHTML = '';
        room.players.forEach(p => {
            const li = document.createElement('li');
            li.className = 'player-item';
            li.innerHTML = `
        <span class="player-avatar">${esc(p.name[0].toUpperCase())}</span>
        <span class="player-name">${esc(p.name)}</span>
        ${p.id === room.hostId    ? '<span class="host-tag">HOST</span>' : ''}
        ${p.id === state.playerId ? '<span class="you-tag">YOU</span>'   : ''}
      `;
            list.appendChild(li);
        });
    }

    const countEl = document.getElementById('lobby-player-count');
    if (countEl) countEl.textContent = `${room.players.length} / ${room.settings?.playerCount ?? 4}`;

    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
        const required = room.settings?.playerCount ?? 4;
        const ready    = room.players.filter(p => p.connected !== false).length >= required;
        startBtn.disabled    = !state.isHost || !ready;
        startBtn.textContent = (state.isHost && ready)
            ? 'Start Game →'
            : `Waiting for players... (${room.players.length}/${required})`;
    }
}

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
      </div>`;
        container.appendChild(block);
    });

    container.addEventListener('input', () => {
        const filled = questions.filter((_, i) =>
            document.querySelector(`[data-index="${i}"]`)?.value.trim()
        ).length;
        const pct = Math.round((filled / questions.length) * 100);
        const progEl  = document.getElementById('r1-progress');
        const fillEl  = document.getElementById('r1-progress-fill');
        const doneBtn = document.getElementById('btn-r1-done');
        if (progEl)  progEl.textContent = `${filled} / ${questions.length} answered`;
        if (fillEl)  fillEl.style.width = `${pct}%`;
        if (doneBtn) doneBtn.disabled   = filled < questions.length;
    });
}

function renderRound2(assignedAnswers, round1Questions, round2Questions) {
    // Mystery profile — no name shown
    const profileEl = document.getElementById('r2-profile-answers');
    if (profileEl) {
        profileEl.innerHTML = '';
        profileEl.style.display = ''; // reset if it was hidden
        round1Questions.forEach((q, i) => {
            const div = document.createElement('div');
            div.className = 'profile-qa';
            div.innerHTML = `
        <span class="profile-q">${esc(q)}</span>
        <span class="profile-a">"${esc(assignedAnswers[i] || '—')}"</span>`;
            profileEl.appendChild(div);
        });
    }
    // Reset hide button label
    const hideBtn = document.getElementById('btn-hide-profile');
    if (hideBtn) hideBtn.textContent = 'Hide Profile ▲';

    // R2 questions
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
      </div>`;
        container.appendChild(block);
    });

    container.addEventListener('input', () => {
        const filled = round2Questions.filter((_, i) =>
            document.querySelector(`[data-r2-index="${i}"]`)?.value.trim()
        ).length;
        const pct = Math.round((filled / round2Questions.length) * 100);
        const progEl  = document.getElementById('r2-progress');
        const fillEl  = document.getElementById('r2-progress-fill');
        const doneBtn = document.getElementById('btn-r2-done');
        if (progEl)  progEl.textContent = `${filled} / ${round2Questions.length} answered`;
        if (fillEl)  fillEl.style.width = `${pct}%`;
        if (doneBtn) doneBtn.disabled   = filled < round2Questions.length;
    });
}

function renderVoting({ targetPlayerNumber, targetName, targetRound1, targetRound2, round1Questions, round2Questions, isBeingEvaluated, progress }) {
    document.getElementById('voting-title').textContent =
        `Evaluating P${targetPlayerNumber} — ${esc(targetName)}`;

    // Progress dots
    const dotsEl = document.getElementById('voting-dots');
    if (dotsEl && progress) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < progress.total; i++) {
            const dot = document.createElement('span');
            dot.className = 'dot' +
                (i === progress.current - 1 ? ' dot-active' : i < progress.current - 1 ? ' dot-done' : '');
            dotsEl.appendChild(dot);
        }
    }

    const lockedEl = document.getElementById('voting-locked');
    const activeEl = document.getElementById('voting-active');

    if (isBeingEvaluated) {
        if (lockedEl) lockedEl.classList.remove('hidden');
        if (activeEl) activeEl.style.display = 'none';
        const sub = document.getElementById('voting-subtitle');
        if (sub) sub.textContent = "You're in the hot seat — sit tight";
    } else {
        if (lockedEl) lockedEl.classList.add('hidden');
        if (activeEl) activeEl.style.display = 'block';
        const sub = document.getElementById('voting-subtitle');
        if (sub) sub.textContent = 'Rate how well the impersonator matched';

        const r1El = document.getElementById('voting-r1-answers');
        if (r1El) {
            r1El.innerHTML = '';
            round1Questions.forEach((q, i) => {
                const div = document.createElement('div');
                div.className = 'voting-qa';
                div.innerHTML = `<span class="voting-q">${esc(q)}</span><span class="voting-a">"${esc(targetRound1?.[i] || '—')}"</span>`;
                r1El.appendChild(div);
            });
        }

        const r2El = document.getElementById('voting-r2-answers');
        if (r2El) {
            r2El.innerHTML = '';
            round2Questions.forEach((q, i) => {
                const div = document.createElement('div');
                div.className = 'voting-qa';
                div.innerHTML = `<span class="voting-q">${esc(q)}</span><span class="voting-a impersonated">"${esc(targetRound2?.[i] || '—')}"</span>`;
                r2El.appendChild(div);
            });
        }

        document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
        const ratingLabel = document.getElementById('rating-label');
        const submitBtn   = document.getElementById('btn-submit-vote');
        if (ratingLabel) ratingLabel.textContent   = 'Tap to rate';
        if (submitBtn)   submitBtn.disabled        = true;
        if (submitBtn)   submitBtn.textContent     = 'Submit Vote';
        state.myVote = null;
    }
}

function renderReveal(players, round1Questions, round2Questions, identityMap, scores) {
    const grid    = document.getElementById('reveal-grid');
    const summary = document.getElementById('reveal-summary');
    if (grid)    grid.innerHTML    = '';
    if (summary) summary.innerHTML = '';

    players.forEach(player => {
        const impersonatorId = Object.keys(identityMap).find(k => identityMap[k] === player.id);
        const impersonator   = players.find(p => p.id === impersonatorId);
        const score          = scores[impersonatorId]?.toFixed(1) ?? '—';

        const card = document.createElement('div');
        card.className = 'reveal-column';
        card.innerHTML = `
      <div class="reveal-player-header">
        <span class="reveal-player-num">P${player.number}</span>
        <span class="reveal-player-name">${esc(player.name)}</span>
        <span class="reveal-score-badge">${score} ★</span>
      </div>
      <div class="reveal-identity-line">
        Impersonated by <strong>P${impersonator?.number ?? '?'} — ${esc(impersonator?.name ?? 'Unknown')}</strong>
      </div>
      <div class="reveal-two-col">
        <div class="reveal-section">
          <div class="reveal-section-header real-header">Round 1 — Their words</div>
          ${round1Questions.map((q, i) => `
            <div class="reveal-qa">
              <span class="reveal-q">${esc(q)}</span>
              <span class="reveal-a">"${esc(player.round1Answers?.[i] || '—')}"</span>
            </div>`).join('')}
        </div>
        <div class="reveal-section reveal-section-alt">
          <div class="reveal-section-header impersonated-header">Round 2 — ${esc(impersonator?.name ?? '?')}'s version</div>
          ${round2Questions.map((q, i) => `
            <div class="reveal-qa">
              <span class="reveal-q">${esc(q)}</span>
              <span class="reveal-a impersonated">"${esc(impersonator?.round2Answers?.[i] || '—')}"</span>
            </div>`).join('')}
        </div>
      </div>`;
        if (grid) grid.appendChild(card);

        if (summary) {
            const pair = document.createElement('div');
            pair.className = 'reveal-pair';
            pair.innerHTML = `
        <span>${esc(impersonator?.name ?? '?')} answered for ${esc(player.name)}</span>
        <span class="reveal-pair-score">${score} ★</span>`;
            summary.appendChild(pair);
        }
    });
}

function renderWinner(name, number, score) {
    const nameEl  = document.getElementById('winner-name');
    const scoreEl = document.getElementById('winner-score');
    if (nameEl)  nameEl.textContent  = `P${number} — ${esc(name)}`;
    if (scoreEl) scoreEl.textContent = `${score.toFixed(1)} / 5`;
}