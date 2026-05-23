'use strict';

// ─── QUESTION BANK ────────────────────────────────────────────────────────────
// These mirror the server-side bank in server/questionBank.js
// Used client-side only for display purposes (e.g. demo mode, preview)
// The server is the source of truth for which questions get used in a game

const Questions = {

    // ── Round 1 — "Be Yourself" ───────────────────────────────────────────────
    // Players answer these about themselves
    round1: [
        "What food would you defend with your life?",
        "What keeps you up at 3am?",
        "What's something you pretend to like but secretly don't?",
        "Describe yourself in 3 words your mom would disagree with.",
        "What's your most controversial opinion?",
        "What's the weirdest thing you've ever googled?",
        "What's a skill you lie about having?",
        "What would your villain origin story be?",
        "What makes you irrationally angry?",
        "If you disappeared tomorrow, what would people assume happened?",
        "What's your guilty pleasure no one knows about?",
        "What's the worst advice you've ever followed?",
        "What are you weirdly proud of?",
        "What would you do if you were invisible for a day?",
        "What's a hill you will die on?",
        "What's your most irrational fear?",
        "If your life had a theme song, what would it be?",
        "What's the most embarrassing thing in your search history?",
        "What's a secret talent you've never shown anyone?",
        "What would your autobiography be titled?",
    ],

    // ── Round 2 — "Be Someone Else" ──────────────────────────────────────────
    // Players answer these AS the person they were assigned
    round2: [
        "What's their guilty pleasure TV show?",
        "How would they react if they won the lottery?",
        "What were they like in high school?",
        "What's their love language?",
        "What's the last thing they'd ever do?",
        "What do they secretly think they're the best at?",
        "What would they name their pet?",
        "How do they act when they're angry?",
        "What's their dream vacation?",
        "What's their biggest red flag?",
        "What would they order at a restaurant they've never been to?",
        "How would they survive a zombie apocalypse?",
        "What do they do when no one is watching?",
        "What's their toxic trait?",
    ],

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Get a random subset (used for preview/demo only — server picks for real games)
    getRandom(pool, count) {
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, pool.length));
    },

    getRandomRound1(count = 7) {
        return this.getRandom(this.round1, count);
    },

    getRandomRound2(count = 4) {
        return this.getRandom(this.round2, count);
    },
};