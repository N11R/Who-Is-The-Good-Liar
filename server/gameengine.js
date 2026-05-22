'use strict';

const questionBank = require('./questionbank');

// ─── START ROUND 1 ────────────────────────────────────────────────────────────
function startRound1(room) {
    room.phase = 'round1';

    // Pick random questions from the bank
    room.questions.round1 = questionBank.getRandom(
        questionBank.round1,
        room.settings.round1Questions
    );

    // Set timer end timestamp
    const ms = room.settings.timerMinutes * 60 * 1000;
    room.timerEnd = Date.now() + ms;

    return {
        round1Questions: room.questions.round1,
        timerEnd: room.timerEnd,
    };
}

// ─── START ROUND 2 ────────────────────────────────────────────────────────────
function startRound2(room) {
    room.phase = 'round2';

    // Pick random Round 2 questions
    room.questions.round2 = questionBank.getRandom(
        questionBank.round2,
        room.settings.round2Questions
    );

    // Assign identities — nobody gets themselves
    room.identityMap = assignIdentities(room.players.map(p => p.id));

    // Store assignedPlayerId on each player for reference
    room.players.forEach(p => {
        p.assignedPlayerId = room.identityMap[p.id];
    });

    // Set new timer
    const ms = room.settings.timerMinutes * 60 * 1000;
    room.timerEnd = Date.now() + ms;

    return {
        round2Questions: room.questions.round2,
        timerEnd: room.timerEnd,
    };
}

// ─── START VOTING ─────────────────────────────────────────────────────────────
function startVoting(room) {
    room.phase = 'voting';
    room.voting.currentPlayerIndex = 0;
    room.voting.votes = {};
}

// ─── CALCULATE SCORES ─────────────────────────────────────────────────────────
// The IMPERSONATOR earns the score, not the person being impersonated.
// Score = average of all other players' ratings on how well
//         the impersonator's Round 2 matched the target's Round 1.
function calculateScores(room) {
    const scores = {}; // { impersonatorId: averageRating }

    room.players.forEach(targetPlayer => {
        // Find who impersonated this target
        const impersonatorId = Object.keys(room.identityMap).find(
            k => room.identityMap[k] === targetPlayer.id
        );
        if (!impersonatorId) return;

        // Collect votes from everyone EXCEPT the target (they can't vote on themselves)
        const votesForTarget = room.voting.votes[targetPlayer.number] ?? {};
        const ratings = Object.entries(votesForTarget)
            .filter(([voterId]) => voterId !== targetPlayer.id)
            .map(([, rating]) => Number(rating));

        const avg = ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : 0;

        // Score goes to the impersonator
        scores[impersonatorId] = parseFloat(avg.toFixed(2));

        // Also store on the impersonator player object
        const impersonator = room.players.find(p => p.id === impersonatorId);
        if (impersonator) impersonator.averageRating = scores[impersonatorId];
    });

    return { scores };
}

// ─── GET WINNER ───────────────────────────────────────────────────────────────
function getWinner(room) {
    return room.players.reduce((best, p) =>
            p.averageRating > best.averageRating ? p : best
        , room.players[0]);
}

// ─── IDENTITY ASSIGNMENT ──────────────────────────────────────────────────────
// Shuffle player IDs so nobody is assigned to themselves.
// Uses Fisher-Yates with a self-assignment check,
// falls back to a simple rotation if shuffle keeps hitting self-assignments.
function assignIdentities(playerIds) {
    if (playerIds.length < 2) return {};

    let shuffled;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;

    do {
        shuffled = [...playerIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        attempts++;
    } while (
        shuffled.some((id, i) => id === playerIds[i]) &&
        attempts < MAX_ATTEMPTS
        );

    // Guaranteed fallback: rotate by 1 (P1→P2, P2→P3, ..., Pn→P1)
    if (attempts >= MAX_ATTEMPTS) {
        shuffled = [...playerIds.slice(1), playerIds[0]];
    }

    // Build map: { impersonatorId: targetId }
    const map = {};
    playerIds.forEach((id, i) => {
        map[id] = shuffled[i];
    });

    return map;
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
    startRound1,
    startRound2,
    startVoting,
    calculateScores,
    getWinner,
    assignIdentities,
};