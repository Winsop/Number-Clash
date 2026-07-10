import express from "express";
import http from "http";
import path from "path";
import { Server, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";
import { 
  createRoom, 
  getRoomByCode, 
  rooms, 
  games, 
  createGame, 
  addPlayerToRoom, 
  getBattleStats, 
  updateBattleStats, 
  chats,
  generateSecureToken
} from "./server/dbStore";
import { evaluateGuess, isValidDigitString } from "./src/validation";
import { ChatMessage, GuessRecord } from "./src/types";

const PORT = Number(process.env.PORT) || 3000;

// Simple profanity list for chat filter
const BANNED_WORDS = ["fuck", "shit", "bitch", "asshole", "cunt", "bastard", "dick", "pussy", "nigger"];
function filterProfanity(text: string): string {
  let filtered = text;
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    filtered = filtered.replace(regex, "*".repeat(word.length));
  }
  return filtered;
}

// Consistent structured logging helper
function serverLog(tag: string, message: string) {
  console.log(`[${tag.toUpperCase()}] ${message}`);
}

async function startServer() {
  const app = reportExpressApp(express());
  const server = http.createServer(app);
  
  // Attach Socket.IO to the Express HTTP Server
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // Track active connection recovery timers
  const disconnectTimers: { [playerId: string]: NodeJS.Timeout } = {};
  
  // Track active game turn timers on server
  const turnTimers: { [roomId: string]: NodeJS.Timeout } = {};

  // Track socket to playerId/roomId associations for rapid cleanup on disconnect
  const socketSessions: { [socketId: string]: { roomId: string; playerId: string } } = {};

  // API endpoint for health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Clean, robust helper to start/advance turns
  function advanceTurn(roomId: string) {
    const room = rooms[roomId];
    if (!room || !room.activeGameId) return;
    const game = games[room.activeGameId];
    if (!game || game.status !== "IN_PROGRESS") return;

    // Clear old timer if any
    if (turnTimers[roomId]) {
      clearTimeout(turnTimers[roomId]);
      delete turnTimers[roomId];
    }

    // Toggle turn
    game.currentTurnSlot = game.currentTurnSlot === 1 ? 2 : 1;
    game.turnNumber += 1;

    if (room.turnTimerSec) {
      const duration = room.turnTimerSec * 1000;
      game.timerEndsAt = new Date(Date.now() + duration).toISOString();
      
      turnTimers[roomId] = setTimeout(() => {
        handleTurnTimeout(roomId);
      }, duration);
    } else {
      game.timerEndsAt = null;
    }

    serverLog("turn", `Turn advanced to slot ${game.currentTurnSlot} inside room ${roomId}, turn number: ${game.turnNumber}`);

    io.to(roomId).emit("turn_changed", {
      currentTurnSlot: game.currentTurnSlot,
      turnNumber: game.turnNumber,
      timerEndsAt: game.timerEndsAt
    });
  }

  // Handle automatic turn timeout expiration
  function handleTurnTimeout(roomId: string) {
    const room = rooms[roomId];
    if (!room || !room.activeGameId) return;
    const game = games[room.activeGameId];
    if (!game || game.status !== "IN_PROGRESS") return;

    const timedOutSlot = game.currentTurnSlot;
    game.consecutiveTimeouts[timedOutSlot] += 1;

    serverLog("turn", `Turn timed out for slot ${timedOutSlot} inside room ${roomId}. Consecutive timeouts: ${game.consecutiveTimeouts[timedOutSlot]}`);

    // Trigger stall condition if 3 consecutive timeouts occur
    if (game.consecutiveTimeouts[timedOutSlot] >= 3) {
      // Broadcast stall detection warning to the room
      io.to(roomId).emit("stall_detected", {
        stalledSlot: timedOutSlot,
        opponentSlot: timedOutSlot === 1 ? 2 : 1,
        message: `Player ${timedOutSlot} has missed 3 turns consecutively. Opponent may now claim victory.`
      });
    } else {
      // Normal turn timeout advance
      advanceTurn(roomId);
    }
  }

  // Socket.IO event registrations
  io.on("connection", (socket: Socket) => {
    serverLog("join_room", `Socket connected: ${socket.id}`);

    // Standard client handshake registration
    socket.on("register_session", (payload: { playerId?: string; sessionToken?: string }, callback) => {
      try {
        let playerId = payload.playerId;
        let sessionToken = payload.sessionToken;
        const isNew = !playerId || !sessionToken;
        
        if (!playerId || !sessionToken) {
          playerId = `usr_${generateSecureToken(8)}`;
          sessionToken = generateSecureToken(32);
        }

        serverLog("join_room", `Session registered for playerId: ${playerId} (new: ${isNew})`);
        if (callback) callback({ playerId, sessionToken });
      } catch (err: any) {
        serverLog("error", `register_session failed: ${err.message}`);
        if (callback) callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    });

    // 1. CREATE ROOM
    socket.on("create_room", (payload: { turnTimerSec: number | null }, callback) => {
      try {
        const { turnTimerSec } = payload;
        if (turnTimerSec !== null && ![30, 60, 90].includes(turnTimerSec)) {
          serverLog("error", `create_room validation failed for invalid timer: ${turnTimerSec}`);
          if (callback) {
            callback({ success: false, error: { code: "INVALID_CONFIG", message: "Invalid turn timer value." } });
          }
          return;
        }

        const room = createRoom(turnTimerSec);
        const player = addPlayerToRoom(room.id, "Host", undefined);
        
        if (!player) {
          serverLog("error", `create_room failed to add Host player for room ID: ${room.id}`);
          if (callback) {
            callback({ success: false, error: { code: "CREATE_FAILED", message: "Failed to initialize player." } });
          }
          return;
        }

        socket.join(room.id);
        socketSessions[socket.id] = { roomId: room.id, playerId: player.playerId };

        serverLog("create_room", `Room created: ${room.id}, code: ${room.roomCode}, timer: ${turnTimerSec}`);
        serverLog("join_room", `Player Host (slot 1) added to room: ${room.id}. Player Count: 1/2`);
        serverLog("join_room", `Room status changed to: ${room.status}`);

        if (callback) {
          callback({
            success: true,
            roomCode: room.roomCode,
            roomId: room.id,
            playerId: player.playerId,
            sessionToken: player.sessionToken,
            slot: 1
          });
        }
      } catch (err: any) {
        serverLog("error", `create_room failed: ${err.message}`);
        if (callback) {
          callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
        }
      }
    });

    // 2. JOIN ROOM (OR RECONNECT)
    socket.on("join_room", (payload: { roomCode: string; username?: string; playerId?: string; sessionToken?: string }, callback) => {
      try {
        const { roomCode, username, playerId, sessionToken } = payload;
        serverLog("join_room", `Attempt to join room code: ${roomCode} by playerId: ${playerId}`);

        const room = getRoomByCode(roomCode);

        if (!room) {
          serverLog("join_room", `Room code not found: ${roomCode}`);
          if (callback) {
            callback({ success: false, error: { code: "INVALID_ROOM", message: "The target room code does not exist." } });
          }
          return;
        }

        serverLog("join_room", `Room found: ${room.id}, status: ${room.status}`);

        // Check if player is attempting reconnection
        const existingPlayer = room.players.find(
          (p) => p.playerId === playerId && p.sessionToken === sessionToken
        );

        if (existingPlayer) {
          // Clear any active disconnect timer for this player
          if (disconnectTimers[existingPlayer.playerId]) {
            clearTimeout(disconnectTimers[existingPlayer.playerId]);
            delete disconnectTimers[existingPlayer.playerId];
          }

          existingPlayer.connected = true;
          socket.join(room.id);
          socketSessions[socket.id] = { roomId: room.id, playerId: existingPlayer.playerId };

          serverLog("join_room", `Player reconnected to room ${room.id} (slot ${existingPlayer.slot})`);
          
          // Inform opponent of reconnection
          io.to(room.id).emit("player_reconnected", { slot: existingPlayer.slot });

          // Send comprehensive state sync (catch-up)
          const game = room.activeGameId ? games[room.activeGameId] : null;
          
          if (callback) {
            callback({
              success: true,
              roomId: room.id,
              slot: existingPlayer.slot,
              username: existingPlayer.username,
              reconnected: true,
              room: {
                roomCode: room.roomCode,
                turnTimerSec: room.turnTimerSec,
                status: room.status,
                players: room.players.map(p => ({ 
                  playerId: p.playerId, 
                  username: p.username, 
                  slot: p.slot, 
                  connected: p.connected,
                  secretSubmitted: p.secretSubmitted
                }))
              },
              game: game ? {
                id: game.id,
                currentTurnSlot: game.currentTurnSlot,
                turnNumber: game.turnNumber,
                status: game.status,
                timerEndsAt: game.timerEndsAt,
                winnerSlot: game.winnerSlot,
                playerSecretSubmitted: existingPlayer.slot === 1 ? !!game.player1Secret : !!game.player2Secret,
                opponentSecretSubmitted: existingPlayer.slot === 1 ? !!game.player2Secret : !!game.player1Secret,
                myGuesses: existingPlayer.slot === 1 ? game.player1Guesses : game.player2Guesses,
                opponentGuesses: existingPlayer.slot === 1 ? game.player2Guesses : game.player1Guesses,
                myRevealedBoard: existingPlayer.slot === 1 ? game.player1Revealed : game.player2Revealed,
                opponentRevealedBoard: existingPlayer.slot === 1 ? game.player2Revealed : game.player1Revealed
              } : null,
              chats: chats[room.id] || []
            });
          }
          return;
        }

        // Standard new join sequence
        if (room.players.length >= 2) {
          serverLog("join_room", `Room full: ${room.id}`);
          if (callback) {
            callback({ success: false, error: { code: "ROOM_FULL", message: "This duel arena is already full." } });
          }
          return;
        }

        if (room.status !== "CREATED" && room.status !== "WAITING_FOR_PLAYER") {
          serverLog("join_room", `Room expired: ${room.id}, status: ${room.status}`);
          if (callback) {
            callback({ success: false, error: { code: "ROOM_EXPIRED", message: "This room is no longer open for new joins." } });
          }
          return;
        }

        const cleanUsername = (username || "").trim().slice(0, 15).replace(/<[^>]*>/g, "");
        const newPlayer = addPlayerToRoom(room.id, cleanUsername, playerId);

        if (!newPlayer) {
          serverLog("join_room", `Join failed to add player to room: ${room.id}`);
          if (callback) {
            callback({ success: false, error: { code: "JOIN_FAILED", message: "Failed to join room." } });
          }
          return;
        }

        socket.join(room.id);
        socketSessions[socket.id] = { roomId: room.id, playerId: newPlayer.playerId };

        serverLog("join_room", `Player ${newPlayer.username} (slot ${newPlayer.slot}) added to room: ${room.id}`);
        serverLog("join_room", `Player count: ${room.players.length}/2`);
        serverLog("join_room", `Room status changed to: ${room.status}`);

        // Broadcast player join to the room channel with full attributes to keep client states synchronized
        const fullPlayersList = room.players.map(p => ({
          playerId: p.playerId,
          username: p.username,
          slot: p.slot,
          connected: p.connected,
          secretSubmitted: p.secretSubmitted
        }));

        io.to(room.id).emit("player_joined", {
          slot: newPlayer.slot,
          username: newPlayer.username,
          joinedCount: room.players.length,
          players: fullPlayersList
        });

        serverLog("join_room", `Broadcasted player_joined to room ID: ${room.id}`);

        if (callback) {
          callback({
            success: true,
            roomId: room.id,
            playerId: newPlayer.playerId,
            sessionToken: newPlayer.sessionToken,
            slot: newPlayer.slot,
            room: {
              roomCode: room.roomCode,
              turnTimerSec: room.turnTimerSec,
              status: room.status,
              players: fullPlayersList
            }
          });
        }
      } catch (err: any) {
        serverLog("error", `join_room failed: ${err.message}`);
        if (callback) {
          callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
        }
      }
    });

    // Helper to validate the standard zero-trust envelope payload
    function validateSession(payload: { roomId: string; playerId: string; sessionToken: string }): boolean {
      const room = rooms[payload.roomId];
      if (!room) return false;
      const player = room.players.find((p) => p.playerId === payload.playerId);
      return !!player && player.sessionToken === payload.sessionToken;
    }

    // VALIDATE ROOM FOR SHARING LINKS
    socket.on("validate_room", (payload: { roomCode: string }, callback) => {
      try {
        const { roomCode } = payload;
        const room = getRoomByCode(roomCode);
        if (!room) {
          if (callback) callback({ success: false, error: { code: "INVALID_ROOM", message: "The target room code does not exist." } });
          return;
        }
        if (room.players.length >= 2) {
          if (callback) callback({ success: false, error: { code: "ROOM_FULL", message: "This duel arena is already full." } });
          return;
        }
        if (room.status !== "CREATED" && room.status !== "WAITING_FOR_PLAYER") {
          if (callback) callback({ success: false, error: { code: "ROOM_EXPIRED", message: "This room is no longer open for new joins." } });
          return;
        }
        if (callback) callback({ success: true });
      } catch (err: any) {
        serverLog("error", `validate_room failed: ${err.message}`);
        if (callback) callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    });

    // 3. SUBMIT SECRET
    socket.on("submit_secret", (payload: { roomId: string; playerId: string; sessionToken: string; secret: string }, callback) => {
      try {
        serverLog("game", `[submit_secret] (1) received payload: roomId=${payload.roomId} playerId=${payload.playerId} secretLength=${typeof payload.secret === "string" ? payload.secret.length : "non-string"}`);
        if (!validateSession(payload)) {
          serverLog("game", `[submit_secret] UNAUTHORIZED access attempt for roomId: ${payload.roomId}`);
          const err = { code: "UNAUTHORIZED", message: "Access denied. Token invalid." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        const room = rooms[payload.roomId];
        const player = room.players.find(p => p.playerId === payload.playerId)!;
        serverLog("game", `[submit_secret] (2) room state before mutation: roomStatus=${room.status} activeGameId=${room.activeGameId} players=${room.players.map(p => `slot${p.slot}{id=${p.playerId},submitted=${!!p.secretSubmitted}}`).join(", ")}`);
        
        // Strict payload validation to protect against crashes
        if (typeof payload.secret !== "string" || !isValidDigitString(payload.secret)) {
          serverLog("game", `[submit_secret] REJECTED invalid secret format for player slot ${player.slot} in room ${room.id}`);
          const err = { code: "INVALID_SECRET", message: "Secret key must be exactly 4 numeric digits." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        // Mark player's secret as submitted
        player.secretSubmitted = true;
        serverLog("game", `[submit_secret] (3) room state after mutation: roomStatus=${room.status} activeGameId=${room.activeGameId} players=${room.players.map(p => `slot${p.slot}{id=${p.playerId},submitted=${!!p.secretSubmitted}}`).join(", ")}`);
        serverLog("game", `[submit_secret] Room: ${room.id} | Player: ${player.playerId} | Slot: ${player.slot} | Secret length: ${payload.secret.length}`);
        socket.emit("secret_locked", { success: true });

        // Get or create the game container (with empty secrets — will be filled below)
        let game = room.activeGameId ? games[room.activeGameId] : null;
        if (!game) {
          game = createGame(room.id, "", "");
          // Reset startedAt — will be finalized when both secrets confirmed
          game.startedAt = new Date().toISOString();
          serverLog("game", `[submit_secret] Game container created: ${game.id} for room: ${room.id}`);
        }

        if (player.slot === 1) {
          game.player1Secret = payload.secret;
        } else {
          game.player2Secret = payload.secret;
        }

        serverLog("game", `[submit_secret] (4) game.player1Secret=${game.player1Secret ? "SET" : "EMPTY"}`);
        serverLog("game", `[submit_secret] (5) game.player2Secret=${game.player2Secret ? "SET" : "EMPTY"}`);

        // Compute ready flags for both players
        const p1 = room.players.find(p => p.slot === 1);
        const p2 = room.players.find(p => p.slot === 2);
        const p1Ready = !!p1?.secretSubmitted;
        const p2Ready = !!p2?.secretSubmitted;
        const readyCount = (p1Ready ? 1 : 0) + (p2Ready ? 1 : 0);

        serverLog("game", `[submit_secret] (6) room.players[].secretSubmitted = ${room.players.map(p => `slot${p.slot}:${!!p.secretSubmitted}`).join(", ")}`);
        serverLog("game", `[submit_secret] (7) ready count = ${readyCount}/2`);
        serverLog("game", `[submit_secret] Room: ${room.id} | P1 (${p1?.playerId ?? "none"}) ready: ${p1Ready} | P2 (${p2?.playerId ?? "none"}) ready: ${p2Ready} | Ready count: ${readyCount}/2`);

        const bothPlayersReady = !!game.player1Secret && !!game.player2Secret;
        serverLog("game", `[submit_secret] (8) bothPlayersReady = ${bothPlayersReady}`);

        // Notify room that this player's secret was submitted (without revealing it!)
        serverLog("game", `[submit_secret] (9) emitting player_ready_status = true for slot ${player.slot} to room ${room.id}`);
        io.to(room.id).emit("player_ready_status", {
          slot: player.slot,
          ready: true
        });

        serverLog("game", `[submit_secret] (9) player_ready_status emitted for slot ${player.slot} to room ${room.id}`);

        if (callback) callback({ success: true });

        // Trigger game start once both players have registered their secrets
        if (bothPlayersReady) {
          // Transition game and room to active state
          game.status = "IN_PROGRESS";
          game.startedAt = new Date().toISOString(); // accurate start time
          room.status = "PLAYING";

          // Start active turn 1 timer
          if (room.turnTimerSec) {
            const duration = room.turnTimerSec * 1000;
            game.timerEndsAt = new Date(Date.now() + duration).toISOString();
            
            if (turnTimers[room.id]) clearTimeout(turnTimers[room.id]);
            turnTimers[room.id] = setTimeout(() => {
              handleTurnTimeout(room.id);
            }, duration);
          } else {
            game.timerEndsAt = null;
          }

          serverLog("game", `[submit_secret] (10) emitting game_started = true to room ${room.id} (gameId: ${game.id})`);
          io.to(room.id).emit("game_started", {
            turnTimerSec: room.turnTimerSec,
            firstTurnSlot: 1,
            timerEndsAt: game.timerEndsAt
          });
          serverLog("game", `[submit_secret] (10) game_started emitted for room ${room.id}`);
        } else {
          serverLog("game", `[submit_secret] (10) game_started not emitted; waiting for other player's secret in room ${room.id} (p1Secret: ${!!game.player1Secret}, p2Secret: ${!!game.player2Secret})`);
        }
      } catch (err: any) {
        serverLog("error", `[submit_secret] FAILED with exception: ${err.message}`);
        if (callback) callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    });


    // 4. SUBMIT GUESS
    socket.on("submit_guess", (payload: { roomId: string; playerId: string; sessionToken: string; guess: string }, callback) => {
      try {
        if (!validateSession(payload)) {
          serverLog("game", `submit_guess unauthorized attempt for roomId: ${payload.roomId}`);
          const err = { code: "UNAUTHORIZED", message: "Access denied. Token invalid." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        const room = rooms[payload.roomId];
        const game = room.activeGameId ? games[room.activeGameId] : null;
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        if (!game || game.status !== "IN_PROGRESS") {
          serverLog("game", `submit_guess game not in progress for room: ${room.id}`);
          const err = { code: "INVALID_GAME", message: "Match is not currently in progress." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        if (game.currentTurnSlot !== player.slot) {
          serverLog("game", `submit_guess out of turn attempt by slot: ${player.slot} in room: ${room.id}`);
          const err = { code: "NOT_YOUR_TURN", message: "Please wait for your opponent's action." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        if (typeof payload.guess !== "string" || !isValidDigitString(payload.guess)) {
          serverLog("game", `submit_guess rejected invalid guess format: ${payload.guess}`);
          const err = { code: "INVALID_GUESS", message: "Guess must consist of exactly 4 numeric digits." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        // Guard duplicate guess in current turn list
        const myGuesses = player.slot === 1 ? game.player1Guesses : game.player2Guesses;
        if (myGuesses.some(g => g.guess === payload.guess)) {
          serverLog("game", `submit_guess duplicate guess values blocked: ${payload.guess}`);
          const err = { code: "ALREADY_GUESSED", message: "You have already submitted this guess value." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        // Reset consecutive timeouts on success
        game.consecutiveTimeouts[player.slot] = 0;

        // Evaluate guess feedback index-by-index
        const opponentSecret = player.slot === 1 ? game.player2Secret : game.player1Secret;
        const previouslyRevealedIndices: number[] = [];
        
        // Find already locked discovered indices
        const previousBoard = player.slot === 1 ? game.player1Revealed : game.player2Revealed;
        previousBoard.forEach((val, i) => {
          if (val !== "_") {
            previouslyRevealedIndices.push(i);
          }
        });

        const evalResult = evaluateGuess({
          guess: payload.guess,
          secret: opponentSecret,
          previouslyRevealed: previouslyRevealedIndices
        });

        // Save newly revealed board
        if (player.slot === 1) {
          game.player1Revealed = evalResult.revealedBoard;
        } else {
          game.player2Revealed = evalResult.revealedBoard;
        }

        // Save Guess Record
        const guessRecord: GuessRecord = {
          id: `gs_${generateSecureToken(8)}`,
          playerSlot: player.slot,
          turnNumber: game.turnNumber,
          guess: payload.guess,
          correctPosition: evalResult.correctCount,
          newlyRevealed: evalResult.newlyRevealed,
          revealedBoard: evalResult.revealedBoard,
          createdAt: new Date().toISOString()
        };

        myGuesses.push(guessRecord);

        serverLog("game", `Guess submitted: ${payload.guess} by slot ${player.slot} in room ${room.id}`);

        // Broadcast immediate result to the room channel
        io.to(room.id).emit("guess_result", {
          playerSlot: player.slot,
          guess: payload.guess,
          correctPosition: evalResult.correctCount,
          newlyRevealed: evalResult.newlyRevealed,
          revealedBoard: evalResult.revealedBoard
        });

        if (callback) callback({ success: true });

        // Check if player unlocked absolute victory!
        if (evalResult.isComplete) {
          game.status = "FINISHED";
          game.winnerSlot = player.slot;
          game.endedAt = new Date().toISOString();
          room.status = "GAME_FINISHED";

          // Calculate match duration
          const durationSec = Math.max(
            1,
            Math.floor((new Date(game.endedAt).getTime() - new Date(game.startedAt).getTime()) / 1000)
          );

          serverLog("game", `Game finished in room ${room.id}, winner: slot ${player.slot}`);

          // Reveal all raw secret keys and declare victory
          io.to(room.id).emit("game_finished", {
            winnerSlot: player.slot,
            player1Secret: game.player1Secret,
            player2Secret: game.player2Secret,
            durationSec,
            turnCount: game.turnNumber
          });

          // Save head-to-head records
          const p1 = room.players.find(p => p.slot === 1)!;
          const p2 = room.players.find(p => p.slot === 2)!;
          updateBattleStats(
            p1.playerId,
            p2.playerId,
            player.slot as 1 | 2,
            durationSec,
            game.player1Guesses.length + game.player2Guesses.length
          );

          // Clear turn timers
          if (turnTimers[room.id]) {
            clearTimeout(turnTimers[room.id]);
            delete turnTimers[room.id];
          }
        } else {
          // Normal turn rotation
          advanceTurn(room.id);
        }
      } catch (err: any) {
        serverLog("error", `submit_guess failed: ${err.message}`);
        if (callback) callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    });

    // 5. STALL RECOVERY: CLAIM VICTORY AFTER CONSECUTIVE TIMEOUTS
    socket.on("claim_timeout_victory", (payload: { roomId: string; playerId: string; sessionToken: string }, callback) => {
      try {
        if (!validateSession(payload)) {
          const err = { code: "UNAUTHORIZED", message: "Access denied. Token invalid." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        const room = rooms[payload.roomId];
        const game = room.activeGameId ? games[room.activeGameId] : null;
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        if (!game || game.status !== "IN_PROGRESS") {
          const err = { code: "INVALID_GAME", message: "Match not in progress." };
          if (callback) callback({ success: false, error: err });
          return;
        }

        const timedOutSlot = game.currentTurnSlot;
        if (timedOutSlot === player.slot) {
          const err = { code: "INVALID_ACTION", message: "Cannot claim victory on your own turn." };
          if (callback) callback({ success: false, error: err });
          return;
        }

        if (game.consecutiveTimeouts[timedOutSlot] >= 3) {
          // Accept claim and end game instantly
          game.status = "FINISHED";
          game.winnerSlot = player.slot;
          game.endedAt = new Date().toISOString();
          room.status = "GAME_FINISHED";

          const durationSec = Math.max(
            1,
            Math.floor((new Date(game.endedAt).getTime() - new Date(game.startedAt).getTime()) / 1000)
          );

          serverLog("game", `Game finished via timeout forfeit in room ${room.id}, winner: slot ${player.slot}`);

          io.to(room.id).emit("game_finished", {
            winnerSlot: player.slot,
            player1Secret: game.player1Secret || "____",
            player2Secret: game.player2Secret || "____",
            durationSec,
            turnCount: game.turnNumber,
            reason: "FORFEIT"
          });

          // Update stats
          const p1 = room.players.find(p => p.slot === 1)!;
          const p2 = room.players.find(p => p.slot === 2)!;
          updateBattleStats(
            p1.playerId,
            p2.playerId,
            player.slot as 1 | 2,
            durationSec,
            game.player1Guesses.length + game.player2Guesses.length
          );

          if (turnTimers[room.id]) {
            clearTimeout(turnTimers[room.id]);
            delete turnTimers[room.id];
          }

          if (callback) callback({ success: true });
        } else {
          const err = { code: "INVALID_ACTION", message: "Opponent has not timed out 3 consecutive times." };
          if (callback) callback({ success: false, error: err });
        }
      } catch (err: any) {
        serverLog("error", `claim_timeout_victory failed: ${err.message}`);
        if (callback) callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    });

    // 6. STALL RECOVERY: KEEP WAITING (RESETS COUNTERS)
    socket.on("keep_waiting_stall", (payload: { roomId: string; playerId: string; sessionToken: string }, callback) => {
      try {
        if (!validateSession(payload)) {
          const err = { code: "UNAUTHORIZED", message: "Access denied. Token invalid." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        const room = rooms[payload.roomId];
        const game = room.activeGameId ? games[room.activeGameId] : null;
        if (!game || game.status !== "IN_PROGRESS") {
          const err = { code: "INVALID_GAME", message: "Match not in progress." };
          if (callback) callback({ success: false, error: err });
          return;
        }

        const timedOutSlot = game.currentTurnSlot;
        game.consecutiveTimeouts[timedOutSlot] = 0;
        
        serverLog("game", `Stall recovery: Keep waiting chosen for room ${room.id}`);

        io.to(room.id).emit("stall_resumed", { message: "Resuming battle. Turn advanced." });
        if (callback) callback({ success: true });

        advanceTurn(room.id);
      } catch (err: any) {
        serverLog("error", `keep_waiting_stall failed: ${err.message}`);
        if (callback) callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    });

    // 7. REQUEST REMATCH
    socket.on("request_rematch", (payload: { roomId: string; playerId: string; sessionToken: string }, callback) => {
      try {
        if (!validateSession(payload)) {
          const err = { code: "UNAUTHORIZED", message: "Access denied. Token invalid." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        const room = rooms[payload.roomId];
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        if (room.status !== "GAME_FINISHED" && room.status !== "REMATCH_PENDING") {
          const err = { code: "INVALID_ACTION", message: "Rematch can only be requested after the duel is finished." };
          if (callback) callback({ success: false, error: err });
          socket.emit("error", err);
          return;
        }

        const otherPlayer = room.players.find(p => p.playerId !== player.playerId);
        player.secretSubmitted = false;
        
        serverLog("game", `Rematch requested by slot ${player.slot} in room ${room.id}`);

        if (room.status === "GAME_FINISHED") {
          room.status = "REMATCH_PENDING";
          io.to(room.id).emit("rematch_requested", { slot: player.slot });
          if (callback) callback({ success: true });
        } else if (room.status === "REMATCH_PENDING" && otherPlayer && !otherPlayer.secretSubmitted) {
          room.status = "READY";
          room.activeGameId = null; // Purge active game to restart secret entries
          
          room.players.forEach(p => {
            p.secretSubmitted = false;
          });

          serverLog("game", `Rematch accepted and room status set to READY for room ${room.id}`);
          io.to(room.id).emit("rematch_accepted", { message: "Prepare your secret keys. Rematch started!" });
          if (callback) callback({ success: true });
        }
      } catch (err: any) {
        serverLog("error", `request_rematch failed: ${err.message}`);
        if (callback) callback({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    });

    // 8. SEND CHAT
    socket.on("send_chat", (payload: { roomId: string; playerId: string; sessionToken: string; text: string }) => {
      try {
        if (!validateSession(payload)) return;

        const room = rooms[payload.roomId];
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        // Strict filters and limits
        const textLimit = (payload.text || "").slice(0, 150);
        const filteredText = filterProfanity(textLimit);

        const chatMsg: ChatMessage = {
          id: `chat_${generateSecureToken(8)}`,
          senderSlot: player.slot,
          senderName: player.username,
          text: filteredText,
          timestamp: new Date().toISOString()
        };

        if (!chats[room.id]) chats[room.id] = [];
        chats[room.id].push(chatMsg);

        serverLog("chat", `Broadcast chat in room ${room.id} from slot ${player.slot}`);
        io.to(room.id).emit("chat_broadcast", chatMsg);
      } catch (err: any) {
        serverLog("error", `send_chat failed: ${err.message}`);
      }
    });

    // 9. LEAVE ROOM Explicitly
    socket.on("leave_room", (payload: { roomId: string; playerId: string; sessionToken: string }) => {
      try {
        if (!validateSession(payload)) return;

        const room = rooms[payload.roomId];
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        // Clean up room timers
        if (turnTimers[room.id]) {
          clearTimeout(turnTimers[room.id]);
          delete turnTimers[room.id];
        }

        // Clean up any disconnect recovery timers
        room.players.forEach(p => {
          if (disconnectTimers[p.playerId]) {
            clearTimeout(disconnectTimers[p.playerId]);
            delete disconnectTimers[p.playerId];
          }
        });

        room.status = "CLOSED";
        serverLog("disconnect", `Room closed: ${room.id}, reason: LEAVE`);
        io.to(room.id).emit("room_closed", {
          reason: "LEAVE",
          message: `Duel dissolved because ${player.username} left the arena.`
        });
        
        // Memory Leak Prevention: remove socket mappings and references
        Object.keys(socketSessions).forEach(sid => {
          if (socketSessions[sid].roomId === room.id) {
            delete socketSessions[sid];
          }
        });

        delete rooms[room.id];
        delete chats[room.id];
      } catch (err: any) {
        serverLog("error", `leave_room failed: ${err.message}`);
      }
    });

    // 10. RECON_DISCOVERY: GET BATTLE STATS FOR ACTIVE PAIRING
    socket.on("get_head_to_head_stats", (payload: { roomId: string; p1Id: string; p2Id: string }, callback) => {
      try {
        const stats = getBattleStats(payload.p1Id, payload.p2Id);
        if (callback) callback(stats);
      } catch (err: any) {
        serverLog("error", `get_head_to_head_stats failed: ${err.message}`);
      }
    });

    // DISCONNECT HANDLERS (Grace Period / Reconnection Resilience)
    socket.on("disconnect", () => {
      const session = socketSessions[socket.id];
      if (!session) {
        serverLog("disconnect", `Socket disconnected: ${socket.id} (unregistered session)`);
        return;
      }

      const { roomId, playerId } = session;
      const room = rooms[roomId];
      if (!room) {
        delete socketSessions[socket.id];
        return;
      }

      const player = room.players.find(p => p.playerId === playerId);
      if (!player) {
        delete socketSessions[socket.id];
        return;
      }

      player.connected = false;
      serverLog("disconnect", `Socket disconnected: ${socket.id}, playerId: ${playerId}, room: ${roomId}`);

      // Start 120s grace period countdown
      const graceDuration = 120000; // 120 seconds
      const graceEndsAt = new Date(Date.now() + graceDuration).toISOString();

      io.to(room.id).emit("player_disconnected", {
        slot: player.slot,
        graceEndsAt
      });

      // Schedule teardown timer
      disconnectTimers[playerId] = setTimeout(() => {
        try {
          // If grace period expires without reconnection, terminate game early
          if (!player.connected) {
            room.status = "CLOSED";
            serverLog("disconnect", `Room closed: ${roomId}, reason: ABANDONED (player ${player.username} did not reconnect within window)`);
            io.to(room.id).emit("room_closed", {
              reason: "ABANDONED",
              message: `${player.username} failed to return within the reconnection window.`
            });

            // Clean up state
            if (turnTimers[roomId]) {
              clearTimeout(turnTimers[roomId]);
              delete turnTimers[roomId];
            }

            room.players.forEach(p => {
              if (disconnectTimers[p.playerId]) {
                clearTimeout(disconnectTimers[p.playerId]);
                delete disconnectTimers[p.playerId];
              }
            });

            Object.keys(socketSessions).forEach(sid => {
              if (socketSessions[sid].roomId === roomId) {
                delete socketSessions[sid];
              }
            });

            delete rooms[roomId];
            delete chats[roomId];
          }
        } catch (err: any) {
          serverLog("error", `Grace period cleanup failed: ${err.message}`);
        }
      }, graceDuration);

      delete socketSessions[socket.id];
    });
  });

  // Serve static UI assets and index file
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`=========================================`);
    console.log(`Number Clash full-stack arena live on http://localhost:${PORT}`);
    console.log(`=========================================`);
  });
}

function reportExpressApp(app: any) {
  return app;
}

startServer().catch((err) => {
  console.error("FATAL: Failed to boot Number Clash backend", err);
});
