'use strict';

// ─── TIMER STATE ──────────────────────────────────────────────────────────────
const Timer = {
    _interval: null,
    _onExpire: null,

    // ─── Start countdown from a server timestamp ────────────────────────────
    // timerEnd: Date.now() + ms (set by server, sent to client)
    // onExpire: callback when hits 0
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

        tick(); // render immediately
        this._interval = setInterval(tick, 1000);
    },

    // ─── Stop and clear ─────────────────────────────────────────────────────
    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    },

    // ─── Render time to all .timer-display elements on screen ───────────────
    _render(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        const display = `${min}:${sec.toString().padStart(2, '0')}`;

        document.querySelectorAll('.timer-display').forEach(el => {
            el.textContent = `⏱ ${display} remaining`;

            // Turn red when under 30 seconds
            if (seconds <= 30) {
                el.classList.add('timer-urgent');
            } else {
                el.classList.remove('timer-urgent');
            }

            // Pulse animation under 10 seconds
            if (seconds <= 10) {
                el.classList.add('timer-pulse');
            } else {
                el.classList.remove('timer-pulse');
            }
        });

        // Also update any dedicated timer bar
        this._renderBar(seconds);
    },

    // ─── Optional progress bar that drains as time runs out ─────────────────
    _totalSeconds: 0,
    startWithBar(timerEnd, totalSeconds, onExpire) {
        this._totalSeconds = totalSeconds;
        this.start(timerEnd, onExpire);
    },

    _renderBar(remaining) {
        const bar = document.getElementById('timer-bar');
        if (!bar || !this._totalSeconds) return;
        const pct = (remaining / this._totalSeconds) * 100;
        bar.style.width = `${pct}%`;
        // Color shift: green → yellow → red
        if (pct > 50) bar.style.background = 'var(--teal)';
        else if (pct > 20) bar.style.background = 'var(--accent-warn, #f0a04d)';
        else bar.style.background = 'var(--danger, #f04d4d)';
    },
};