const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const roomManager = require('./roommanager');
const gameEngine = require('./gameengine');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*' }
});

// ─── Serve frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] connected: ${socket.id}`);

    // ── CREATE ROOM ─────────────────────────────────────────────────────────
    socket.on('create-room', ({ name, settings }) => {
        if (!name || !name.trim()) return socket.emit('game-error', { message: 'Name is required.' });

        const { room, player } = roomManager.createRoom(socket.id, name.trim(), settings);
        socket.join(room.code);

        socket.emit('room-created', {
            code: room.code,
            playerId: player.id,
            settings: room.settings,
        });

        console.log(`[room] created ${room.code} by ${name}`);
    });

    // ── JOIN ROOM ────────────────────────────────────────────────────────────
    socket.on('join-room', ({ name, code }) => {
        if (!name || !name.trim()) return socket.emit('game-error', { message: 'Name is required.' });
        if (!code) return socket.emit('game-error', { message: 'Room code is required.' });

        const result = roomManager.joinRoom(socket.id, name.trim(), code.toUpperCase());
        if (result.error) return socket.emit('game-error', { message: result.error });

        const { room, player } = result;
        socket.join(room.code);

        // Tell the joining player they're in
        socket.emit('room-joined', {
            playerId: player.id,
            playerNumber: player.number,
            room: roomManager.roomSummary(room),
        });

        // Tell everyone else a new player arrived
        socket.to(room.code).emit('player-list-update', {
            room: roomManager.roomSummary(room),
        });

        console.log(`[room] ${name} joined ${room.code}`);
    });

    // ── START GAME ───────────────────────────────────────────────────────────
    socket.on('start-game', ({ roomCode }) => {
        const room = roomManager.getRoom(roomCode);
        if (!room) return socket.emit('game-error', { message: 'Room not found.' });
        if (room.hostId !== socket.id) return socket.emit('game-error', { message: 'Only the host can start the game.' });
        if (room.players.length < 3) return socket.emit('game-error', { message: 'Need at least 3 players to start.' });
        if (room.phase !== 'lobby') return socket.emit('game-error', { message: 'Game already started.' });

        const { round1Questions, timerEnd } = gameEngine.startRound1(room);

        io.to(roomCode).emit('game-started', {
            round1Questions,
            timerEnd,
            room: roomManager.roomSummary(room),
        });

        // Auto-advance when timer expires
        scheduleTimer(roomCode, room.settings.timerMinutes * 60 * 1000, () => {
            forceEndRound1(roomCode);
        });

        console.log(`[game] ${roomCode} round 1 started`);
    });

    // ── SUBMIT ROUND 1 ───────────────────────────────────────────────────────
    socket.on('submit-round1', ({ answers, roomCode }) => {
        const room = roomManager.getRoom(roomCode);
        if (!room || room.phase !== 'round1') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.round1Answers) return; // already submitted

        player.round1Answers = answers;

        const doneCount = room.players.filter(p => p.round1Answers).length;
        const totalCount = room.players.length;

        io.to(roomCode).emit('round1-player-done', { doneCount, totalCount });
        console.log(`[game] ${roomCode} round1 ${doneCount}/${totalCount}`);

        // All submitted — move to Round 2
        if (doneCount === totalCount) {
            clearRoomTimer(roomCode);
            startRound2(roomCode);
        }
    });

    // ── SUBMIT ROUND 2 ───────────────────────────────────────────────────────
    socket.on('submit-round2', ({ answers, roomCode }) => {
        const room = roomManager.getRoom(roomCode);
        if (!room || room.phase !== 'round2') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.round2Answers) return; // already submitted

        player.round2Answers = answers;

        const doneCount = room.players.filter(p => p.round2Answers).length;
        const totalCount = room.players.length;

        io.to(roomCode).emit('round2-player-done', { doneCount, totalCount });
        console.log(`[game] ${roomCode} round2 ${doneCount}/${totalCount}`);

        // All submitted — move to voting
        if (doneCount === totalCount) {
            clearRoomTimer(roomCode);
            startVoting(roomCode);
        }
    });

    // ── SUBMIT VOTE ──────────────────────────────────────────────────────────
    socket.on('submit-vote', ({ targetId, rating, roomCode }) => {
        const room = roomManager.getRoom(roomCode);
        if (!room || room.phase !== 'voting') return;

        const voter = room.players.find(p => p.id === socket.id);
        const target = room.players.find(p => p.number === targetId);
        if (!voter || !target) return;
        if (voter.id === target.id) return; // can't vote on yourself

        // Store vote: votes[targetPlayerNumber][voterId] = rating
        if (!room.voting.votes[targetId]) room.voting.votes[targetId] = {};
        room.voting.votes[targetId][socket.id] = rating;

        console.log(`[vote] ${voter.name} rated P${targetId}: ${rating}/5`);

        // Check if all eligible voters submitted for this hot seat player
        const targetPlayer = room.players[room.voting.currentPlayerIndex];
        const eligibleVoters = room.players.filter(p => p.id !== targetPlayer.id);
        const votesForTarget = room.voting.votes[targetPlayer.number] ?? {};
        const voteCount = Object.keys(votesForTarget).length;

        if (voteCount >= eligibleVoters.length) {
            advanceVoting(roomCode);
        }
    });

    // ── REQUEST WINNER ───────────────────────────────────────────────────────
    socket.on('request-winner', ({ roomCode }) => {
        const room = roomManager.getRoom(roomCode);
        if (!room || room.phase !== 'reveal') return;
        sendWinner(roomCode);
    });

    // ── NEW GAME ─────────────────────────────────────────────────────────────
    socket.on('request-new-game', ({ roomCode }) => {
        const room = roomManager.getRoom(roomCode);
        if (!room) return;
        if (room.hostId !== socket.id) return socket.emit('game-error', { message: 'Only the host can start a new game.' });

        roomManager.resetRoom(room);
        io.to(roomCode).emit('game-reset');
        console.log(`[game] ${roomCode} reset`);
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log(`[-] disconnected: ${socket.id}`);
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) return;

        if (room.phase === 'lobby') {
            // Remove player from lobby entirely
            roomManager.removePlayer(room, socket.id);

            // If host left, assign new host
            if (room.hostId === socket.id && room.players.length > 0) {
                room.hostId = room.players[0].id;
                room.players[0].isHost = true;
            }

            if (room.players.length === 0) {
                roomManager.deleteRoom(room.code);
                return;
            }

            io.to(room.code).emit('player-list-update', {
                room: roomManager.roomSummary(room),
            });
        } else {
            // Mid-game: mark as disconnected but keep their data
            const player = room.players.find(p => p.id === socket.id);
            if (player) player.connected = false;

            io.to(room.code).emit('player-list-update', {
                room: roomManager.roomSummary(room),
            });
        }
    });

    // ─── INTERNAL HELPERS ──────────────────────────────────────────────────────

    function startRound2(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room) return;

        const { round2Questions, timerEnd } = gameEngine.startRound2(room);

        // Send each player their assigned R1 answers privately
        room.players.forEach(player => {
            const assignedPlayer = room.players.find(p => p.id === room.identityMap[player.id]);
            const assignedAnswers = assignedPlayer?.round1Answers ?? [];

            io.to(player.id).emit('round2-start', {
                assignedAnswers,
                round1Questions: room.questions.round1,
                round2Questions,
                timerEnd,
            });
        });

        // Auto-advance when timer expires
        scheduleTimer(roomCode, room.settings.timerMinutes * 60 * 1000, () => {
            forceEndRound2(roomCode);
        });

        console.log(`[game] ${roomCode} round 2 started`);
    }

    function startVoting(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room) return;

        gameEngine.startVoting(room);
        emitCurrentVotingRound(roomCode);
        console.log(`[game] ${roomCode} voting started`);
    }

    function advanceVoting(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room) return;

        room.voting.currentPlayerIndex++;

        if (room.voting.currentPlayerIndex >= room.players.length) {
            // All players evaluated — go to reveal
            endVoting(roomCode);
        } else {
            io.to(roomCode).emit('voting-collected', {
                nextTargetNumber: room.players[room.voting.currentPlayerIndex].number,
            });
            emitCurrentVotingRound(roomCode);
        }
    }

    function emitCurrentVotingRound(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room) return;

        const targetPlayer = room.players[room.voting.currentPlayerIndex];

        // Find who impersonated this player
        const impersonatorId = Object.keys(room.identityMap).find(
            k => room.identityMap[k] === targetPlayer.id
        );
        const impersonator = room.players.find(p => p.id === impersonatorId);

        // Send voting event to each player
        room.players.forEach(player => {
            const isBeingEvaluated = player.id === targetPlayer.id;

            io.to(player.id).emit('voting-start', {
                targetPlayerNumber: targetPlayer.number,
                targetName: targetPlayer.name,
                targetRound1: targetPlayer.round1Answers,
                targetRound2: impersonator?.round2Answers ?? [],
                round1Questions: room.questions.round1,
                round2Questions: room.questions.round2,
                isBeingEvaluated,
                progress: {
                    current: room.voting.currentPlayerIndex + 1,
                    total: room.players.length,
                },
            });
        });
    }

    function endVoting(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room) return;

        const { scores } = gameEngine.calculateScores(room);
        room.phase = 'reveal';

        io.to(roomCode).emit('reveal-data', {
            players: room.players,
            round1Questions: room.questions.round1,
            round2Questions: room.questions.round2,
            identityMap: room.identityMap,
            scores,
        });

        console.log(`[game] ${roomCode} reveal`);
    }

    function sendWinner(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room) return;

        const winner = gameEngine.getWinner(room);
        room.phase = 'winner';

        io.to(roomCode).emit('winner-data', {
            winnerName: winner.name,
            winnerNumber: winner.number,
            score: winner.averageRating,
        });

        console.log(`[game] ${roomCode} winner: ${winner.name} (${winner.averageRating.toFixed(1)})`);
    }

    // Force submit disconnected/slow players at timer expiry
    function forceEndRound1(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room || room.phase !== 'round1') return;

        room.players.forEach(p => {
            if (!p.round1Answers) {
                p.round1Answers = room.questions.round1.map(() => '(no answer)');
            }
        });

        io.to(roomCode).emit('timer-expired', { phase: 'round1' });
        startRound2(roomCode);
    }

    function forceEndRound2(roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (!room || room.phase !== 'round2') return;

        room.players.forEach(p => {
            if (!p.round2Answers) {
                p.round2Answers = room.questions.round2.map(() => '(no answer)');
            }
        });

        io.to(roomCode).emit('timer-expired', { phase: 'round2' });
        startVoting(roomCode);
    }
});

// ─── Timer management (per room) ──────────────────────────────────────────────
const roomTimers = {};

function scheduleTimer(roomCode, ms, callback) {
    clearRoomTimer(roomCode);
    roomTimers[roomCode] = setTimeout(callback, ms);
}

function clearRoomTimer(roomCode) {
    if (roomTimers[roomCode]) {
        clearTimeout(roomTimers[roomCode]);
        delete roomTimers[roomCode];
    }
}

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`🪞 Liar's Mirror → http://localhost:${PORT}`);
});