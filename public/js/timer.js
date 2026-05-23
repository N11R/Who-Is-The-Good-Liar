'use strict';

// ─── TIMER ────────────────────────────────────────────────────────────────────
const Timer = {
    _interval:     null,
    _onExpire:     null,
    _totalSeconds: 0,

    start(timerEnd, onExpire) {
        this.stop();
        this._onExpire = onExpire;

        const tick = () => {
            const remaining = Math.max(0, Math.floor((timerEnd - Date.now()) / 1000));
            this._render(remaining);
            if (remaining <= 0) {
                this.stop();
                if (this._onExpire) this._onExpire();
            }
        };

        tick();
        this._interval = setInterval(tick, 1000);
    },

    startWithBar(timerEnd, totalSeconds, onExpire) {
        this._totalSeconds = totalSeconds;
        this.start(timerEnd, onExpire);
    },

    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    },

    _render(seconds) {
        const min     = Math.floor(seconds / 60);
        const sec     = seconds % 60;
        const display = `${min}:${sec.toString().padStart(2, '0')}`;

        // Update every timer element on every screen — visible or hidden
        document.querySelectorAll(
            '#r1-timer-text, #r1-wait-timer-text, #r2-timer-text, #r2-wait-timer-text, .timer-display'
        ).forEach(el => {
            el.textContent = display;
            el.classList.toggle('timer-urgent', seconds <= 30);
            el.classList.toggle('timer-pulse',  seconds <= 10);
        });

        this._renderBar(seconds);
    },

    _renderBar(remaining) {
        if (!this._totalSeconds) return;
        const pct = Math.round((remaining / this._totalSeconds) * 100);

        document.querySelectorAll(
            '#r1-timer-fill, #r1-wait-timer-fill, #r2-timer-fill, #r2-wait-timer-fill, #timer-bar'
        ).forEach(el => {
            el.style.width = `${pct}%`;
            if (pct > 50)      el.style.background = 'var(--teal)';
            else if (pct > 20) el.style.background = 'var(--accent-warn, #f0a04d)';
            else               el.style.background = 'var(--danger, #f04d4d)';
        });
    },
};

// ─── GLOBAL FUNCTIONS called by game.js ───────────────────────────────────────
function startCountdown(timerEnd, onExpire) {
    const totalSeconds = Math.round((timerEnd - Date.now()) / 1000);
    Timer.startWithBar(timerEnd, totalSeconds, onExpire);
}

function stopCountdown() {
    Timer.stop();
}