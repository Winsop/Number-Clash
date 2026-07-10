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

const PORT = 3000;

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

async function startServer() {
  const app = express();
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
    console.log(`Socket connected: ${socket.id}`);

    // Standard client handshake registration
    socket.on("register_session", (payload: { playerId?: string; sessionToken?: string }, callback) => {
      let playerId = payload.playerId;
      let sessionToken = payload.sessionToken;
      
      if (!playerId || !sessionToken) {
        playerId = `usr_${generateSecureToken(8)}`;
        sessionToken = generateSecureToken(32);
      }

      callback({ playerId, sessionToken });
    });

    // 1. CREATE ROOM
    socket.on("create_room", (payload: { turnTimerSec: number | null }, callback) => {
      try {
        const { turnTimerSec } = payload;
        if (turnTimerSec !== null && ![30, 60, 90].includes(turnTimerSec)) {
          return socket.emit("error", { code: "INVALID_CONFIG", message: "Invalid turn timer value." });
        }

        const room = createRoom(turnTimerSec);
        const player = addPlayerToRoom(room.id, "Host", undefined);
        
        if (!player) {
          return socket.emit("error", { code: "CREATE_FAILED", message: "Failed to initialize player." });
        }

        socket.join(room.id);
        socketSessions[socket.id] = { roomId: room.id, playerId: player.playerId };

        callback({
          roomCode: room.roomCode,
          roomId: room.id,
          playerId: player.playerId,
          sessionToken: player.sessionToken,
          slot: 1
        });
      } catch (err: any) {
        socket.emit("error", { code: "INTERNAL_ERROR", message: err.message });
      }
    });

    // 2. JOIN ROOM (OR RECONNECT)
    socket.on("join_room", (payload: { roomCode: string; username?: string; playerId?: string; sessionToken?: string }, callback) => {
      try {
        const { roomCode, username, playerId, sessionToken } = payload;
        const room = getRoomByCode(roomCode);

        if (!room) {
          return socket.emit("error", { code: "INVALID_ROOM", message: "The target room code does not exist." });
        }

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

          // Inform opponent of reconnection
          io.to(room.id).emit("player_reconnected", { slot: existingPlayer.slot });

          // Send comprehensive state sync (catch-up)
          const game = room.activeGameId ? games[room.activeGameId] : null;
          
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
              players: room.players.map(p => ({ playerId: p.playerId, username: p.username, slot: p.slot, connected: p.connected }))
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
          return;
        }

        // Standard new join sequence
        if (room.players.length >= 2) {
          return socket.emit("error", { code: "ROOM_FULL", message: "This duel arena is already full." });
        }

        if (room.status !== "CREATED" && room.status !== "WAITING_FOR_PLAYER") {
          return socket.emit("error", { code: "ROOM_EXPIRED", message: "This room is no longer open for new joins." });
        }

        const cleanUsername = (username || "").trim().slice(0, 15).replace(/<[^>]*>/g, "");
        const newPlayer = addPlayerToRoom(room.id, cleanUsername, playerId);

        if (!newPlayer) {
          return socket.emit("error", { code: "JOIN_FAILED", message: "Failed to join room." });
        }

        socket.join(room.id);
        socketSessions[socket.id] = { roomId: room.id, playerId: newPlayer.playerId };

        // Broadcast player join to the room channel
        io.to(room.id).emit("player_joined", {
          slot: newPlayer.slot,
          username: newPlayer.username,
          joinedCount: room.players.length,
          players: room.players.map(p => ({ slot: p.slot, username: p.username }))
        });

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
            players: room.players.map(p => ({ playerId: p.playerId, username: p.username, slot: p.slot, connected: p.connected }))
          }
        });
      } catch (err: any) {
        socket.emit("error", { code: "INTERNAL_ERROR", message: err.message });
      }
    });

    // Helper to validate the standard zero-trust envelope payload
    function validateSession(payload: { roomId: string; playerId: string; sessionToken: string }): boolean {
      const room = rooms[payload.roomId];
      if (!room) return false;
      const player = room.players.find((p) => p.playerId === payload.playerId);
      return !!player && player.sessionToken === payload.sessionToken;
    }

    // 3. SUBMIT SECRET
    socket.on("submit_secret", (payload: { roomId: string; playerId: string; sessionToken: string; secret: string }, callback) => {
      try {
        if (!validateSession(payload)) {
          return socket.emit("error", { code: "UNAUTHORIZED", message: "Access denied. Token invalid." });
        }

        const room = rooms[payload.roomId];
        const player = room.players.find(p => p.playerId === payload.playerId)!;
        
        if (!isValidDigitString(payload.secret)) {
          return socket.emit("error", { code: "INVALID_SECRET", message: "Secret key must be exactly 4 numeric digits." });
        }

        // Mark player's secret as submitted
        player.secretSubmitted = true;
        socket.emit("secret_locked", { success: true });

        // Let player's secret be locked inside a temporary structure or the actual activeGame
        let game = room.activeGameId ? games[room.activeGameId] : null;
        if (!game) {
          // Initialize active game slots
          if (!room.activeGameId) {
            game = createGame(room.id, "", "");
          } else {
            game = games[room.activeGameId];
          }
        }

        if (player.slot === 1) {
          game.player1Secret = payload.secret;
        } else {
          game.player2Secret = payload.secret;
        }

        // Notify room that a secret was submitted (without revealing it!)
        io.to(room.id).emit("player_ready_status", {
          slot: player.slot,
          ready: true
        });

        // Trigger game start once both players have registered their secrets
        if (game.player1Secret && game.player2Secret) {
          game.status = "IN_PROGRESS";
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

          io.to(room.id).emit("game_started", {
            turnTimerSec: room.turnTimerSec,
            firstTurnSlot: 1,
            timerEndsAt: game.timerEndsAt
          });
        }
      } catch (err: any) {
        socket.emit("error", { code: "INTERNAL_ERROR", message: err.message });
      }
    });

    // 4. SUBMIT GUESS
    socket.on("submit_guess", (payload: { roomId: string; playerId: string; sessionToken: string; guess: string }) => {
      try {
        if (!validateSession(payload)) {
          return socket.emit("error", { code: "UNAUTHORIZED", message: "Access denied. Token invalid." });
        }

        const room = rooms[payload.roomId];
        const game = room.activeGameId ? games[room.activeGameId] : null;
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        if (!game || game.status !== "IN_PROGRESS") {
          return socket.emit("error", { code: "INVALID_GAME", message: "Match is not currently in progress." });
        }

        if (game.currentTurnSlot !== player.slot) {
          return socket.emit("error", { code: "NOT_YOUR_TURN", message: "Please wait for your opponent's action." });
        }

        if (!isValidDigitString(payload.guess)) {
          return socket.emit("error", { code: "INVALID_GUESS", message: "Guess must consist of exactly 4 numeric digits." });
        }

        // Guard duplicate guess in current turn list
        const myGuesses = player.slot === 1 ? game.player1Guesses : game.player2Guesses;
        if (myGuesses.some(g => g.guess === payload.guess)) {
          return socket.emit("error", { code: "ALREADY_GUESSED", message: "You have already submitted this guess value." });
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

        // Broadcast immediate result to the room channel
        io.to(room.id).emit("guess_result", {
          playerSlot: player.slot,
          guess: payload.guess,
          correctPosition: evalResult.correctCount,
          newlyRevealed: evalResult.newlyRevealed,
          revealedBoard: evalResult.revealedBoard
        });

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
        socket.emit("error", { code: "INTERNAL_ERROR", message: err.message });
      }
    });

    // 5. STALL RECOVERY: CLAIM VICTORY AFTER CONSECUTIVE TIMEOUTS
    socket.on("claim_timeout_victory", (payload: { roomId: string; playerId: string; sessionToken: string }) => {
      try {
        if (!validateSession(payload)) {
          return socket.emit("error", { code: "UNAUTHORIZED", message: "Access denied. Token invalid." });
        }

        const room = rooms[payload.roomId];
        const game = room.activeGameId ? games[room.activeGameId] : null;
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        if (!game || game.status !== "IN_PROGRESS") return;

        const timedOutSlot = game.currentTurnSlot;
        if (timedOutSlot === player.slot) return; // Cannot claim victory if it is your own timeout

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
        }
      } catch (err: any) {
        socket.emit("error", { code: "INTERNAL_ERROR", message: err.message });
      }
    });

    // 6. STALL RECOVERY: KEEP WAITING (RESETS COUNTERS)
    socket.on("keep_waiting_stall", (payload: { roomId: string; playerId: string; sessionToken: string }) => {
      try {
        if (!validateSession(payload)) {
          return socket.emit("error", { code: "UNAUTHORIZED", message: "Access denied. Token invalid." });
        }

        const room = rooms[payload.roomId];
        const game = room.activeGameId ? games[room.activeGameId] : null;
        if (!game || game.status !== "IN_PROGRESS") return;

        const timedOutSlot = game.currentTurnSlot;
        // Reset timeouts
        game.consecutiveTimeouts[timedOutSlot] = 0;
        
        // Notify players that we are resuming and advance turn normally
        io.to(room.id).emit("stall_resumed", { message: "Resuming battle. Turn advanced." });
        advanceTurn(room.id);
      } catch (err: any) {
        socket.emit("error", { code: "INTERNAL_ERROR", message: err.message });
      }
    });

    // 7. REQUEST REMATCH
    socket.on("request_rematch", (payload: { roomId: string; playerId: string; sessionToken: string }) => {
      try {
        if (!validateSession(payload)) {
          return socket.emit("error", { code: "UNAUTHORIZED", message: "Access denied. Token invalid." });
        }

        const room = rooms[payload.roomId];
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        if (room.status !== "GAME_FINISHED" && room.status !== "REMATCH_PENDING") {
          return socket.emit("error", { code: "INVALID_ACTION", message: "Rematch can only be requested after the duel is finished." });
        }

        // Check if opponent already requested rematch
        const otherPlayer = room.players.find(p => p.playerId !== player.playerId);
        
        player.secretSubmitted = false;
        
        if (room.status === "GAME_FINISHED") {
          room.status = "REMATCH_PENDING";
          io.to(room.id).emit("rematch_requested", { slot: player.slot });
        } else if (room.status === "REMATCH_PENDING" && otherPlayer && !otherPlayer.secretSubmitted) {
          // If BOTH players agreed, we reset the room and trigger Secret Entry phase
          room.status = "READY";
          room.activeGameId = null; // Purge active game to restart secret entries
          
          room.players.forEach(p => {
            p.secretSubmitted = false;
          });

          io.to(room.id).emit("rematch_accepted", { message: "Prepare your secret keys. Rematch started!" });
        }
      } catch (err: any) {
        socket.emit("error", { code: "INTERNAL_ERROR", message: err.message });
      }
    });

    // 8. SEND CHAT
    socket.on("send_chat", (payload: { roomId: string; playerId: string; sessionToken: string; text: string }) => {
      try {
        if (!validateSession(payload)) return;

        const room = rooms[payload.roomId];
        const player = room.players.find(p => p.playerId === payload.playerId)!;

        // Strict filters and limits
        const textLimit = payload.text.slice(0, 150);
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

        io.to(room.id).emit("chat_broadcast", chatMsg);
      } catch (err: any) {
        // fail silently for chat logs
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

        room.status = "CLOSED";
        io.to(room.id).emit("room_closed", {
          reason: "LEAVE",
          message: `Duel dissolved because ${player.username} left the arena.`
        });
        
        delete rooms[room.id];
      } catch (err) {
        // ignore
      }
    });

    // 10. RECON_DISCOVERY: GET BATTLE STATS FOR ACTIVE PAIRING
    socket.on("get_head_to_head_stats", (payload: { roomId: string; p1Id: string; p2Id: string }, callback) => {
      try {
        const stats = getBattleStats(payload.p1Id, payload.p2Id);
        callback(stats);
      } catch (err) {
        // ignore
      }
    });

    // DISCONNECT HANDLERS (Grace Period / Reconnection Resilience)
    socket.on("disconnect", () => {
      const session = socketSessions[socket.id];
      if (!session) return;

      const { roomId, playerId } = session;
      const room = rooms[roomId];
      if (!room) return;

      const player = room.players.find(p => p.playerId === playerId);
      if (!player) return;

      player.connected = false;

      // Start 120s grace period countdown
      const graceDuration = 120000; // 120 seconds
      const graceEndsAt = new Date(Date.now() + graceDuration).toISOString();

      io.to(room.id).emit("player_disconnected", {
        slot: player.slot,
        graceEndsAt
      });

      // Schedule teardown timer
      disconnectTimers[playerId] = setTimeout(() => {
        // If grace period expires without reconnection, terminate game early
        if (!player.connected) {
          room.status = "CLOSED";
          io.to(room.id).emit("room_closed", {
            reason: "ABANDONED",
            message: `${player.username} failed to return within the reconnection window.`
          });

          // Clean up state
          if (turnTimers[roomId]) {
            clearTimeout(turnTimers[roomId]);
            delete turnTimers[roomId];
          }
          delete rooms[roomId];
        }
      }, graceDuration);
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

startServer().catch((err) => {
  console.error("FATAL: Failed to boot Number Clash backend", err);
});
