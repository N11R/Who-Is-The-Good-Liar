'use strict';

// ─── ROUND 1 — "Be Yourself" ──────────────────────────────────────────────────
// Players answer these about themselves.
// Server picks randomly based on host's chosen count (min 5, default 7, max 20).
const round1 = [
    // Identity
    "What food would you defend with your life?",
    "What's something you pretend to like but secretly don't?",
    "What's a skill you lie about having?",
    "What are you weirdly proud of?",
    "What's a secret talent you've never shown anyone?",
    "What would your autobiography be titled?",
    "Describe yourself in 3 words your mom would disagree with.",

    // Mind
    "What keeps you up at 3am?",
    "What's your most controversial opinion?",
    "What's the weirdest thing you've ever googled?",
    "What's a hill you will die on?",
    "What's your most irrational fear?",
    "What makes you irrationally angry?",

    // Chaos
    "What would your villain origin story be?",
    "If you disappeared tomorrow, what would people assume happened?",
    "What would you do if you were invisible for a day?",
    "What's the worst advice you've ever followed?",
    "What's the most embarrassing thing in your search history?",

    // Soul
    "What's your guilty pleasure no one knows about?",
    "If your life had a theme song, what would it be?",
    "What do you want people to say at your funeral that they'd never say to your face?",
    "What's a belief you held 5 years ago that you're embarrassed by now?",
    "What's the kindest thing a stranger has ever done for you?",
    "What's something you've never told anyone?",
];

// ─── ROUND 2 — "Be Someone Else" ─────────────────────────────────────────────
// Players answer these AS the person they were assigned.
// Server picks randomly based on host's chosen count (min 3, default 4, max 14).
const round2 = [
    // Personality
    "What's their guilty pleasure TV show?",
    "What were they like in high school?",
    "What's their love language?",
    "What do they secretly think they're the best at?",
    "What's their toxic trait?",
    "What do they do when no one is watching?",
    "How do they act when they're angry?",

    // Scenarios
    "How would they react if they won the lottery?",
    "What's the last thing they'd ever do?",
    "What would they order at a restaurant they've never been to?",
    "How would they survive a zombie apocalypse?",
    "What would they name their pet?",
    "What's their dream vacation?",

    // Roast
    "What's their biggest red flag?",
    "What's the most chaotic decision they would make under pressure?",
    "What would their villain origin story be?",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Pick `count` random questions from a pool, no repeats
function getRandom(pool, count) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, pool.length));
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = { round1, round2, getRandom };