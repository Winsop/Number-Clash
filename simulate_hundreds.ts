import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

interface MatchResult {
  winnerSlot: number;
  durationSec: number;
  turnCount: number;
  p1Secret: string;
  p2Secret: string;
}

// Global Stats Tracker
const stats = {
  totalMatchesStarted: 0,
  totalMatchesCompleted: 0,
  p1Wins: 0,
  p2Wins: 0,
  totalGuesses: 0,
  errors: [] as any[],
  turnCounts: [] as number[],
  durations: [] as number[],
};

// Generates a random 4-digit string
function random4Digits(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += Math.floor(Math.random() * 10).toString();
  }
  return s;
}

// Strategic guess generator based on current revealed board without duplicate attempts
function generateStrategicGuess(revealedBoard: string[], excluded: Set<string>): string {
  let attempts = 0;
  while (attempts < 100) {
    let guess = "";
    for (let i = 0; i < 4; i++) {
      if (revealedBoard[i] && revealedBoard[i] !== "_") {
        guess += revealedBoard[i];
      } else {
        guess += Math.floor(Math.random() * 10).toString();
      }
    }
    if (!excluded.has(guess)) {
      excluded.add(guess);
      return guess;
    }
    attempts++;
  }
  let guess = random4Digits();
  while (excluded.has(guess)) {
    guess = random4Digits();
  }
  excluded.add(guess);
  return guess;
}

/**
 * Runs a single room lifecycle containing N matches (via rematches).
 */
async function runRoomSession(roomIdIdx: number, matchCount: number): Promise<void> {
  const host = io(SERVER_URL, { forceNew: true });
  const challenger = io(SERVER_URL, { forceNew: true });

  let hostCreds = { playerId: "", sessionToken: "" };
  let challengerCreds = { playerId: "", sessionToken: "" };
  let roomCode = "";
  let roomId = "";

  // Local Match State
  let hostBoard: string[] = ["_", "_", "_", "_"];
  let challengerBoard: string[] = ["_", "_", "_", "_"];
  let currentTurnSlot = 1;
  let matchesRemaining = matchCount;

  const hostGuessed = new Set<string>();
  const challengerGuessed = new Set<string>();

  return new Promise<void>((resolve) => {
    // Error tracking
    const handleError = (clientName: string, err: any) => {
      console.error(`[${clientName} ERROR]`, err);
      stats.errors.push({ client: clientName, error: err });
    };

    host.on("error", (err) => handleError(`Host-${roomIdIdx}`, err));
    challenger.on("error", (err) => handleError(`Challenger-${roomIdIdx}`, err));

    // Register Session
    host.emit("register_session", {}, (res: any) => {
      hostCreds = res;
      // Create Room
      host.emit("create_room", { turnTimerSec: null }, (roomRes: any) => {
        roomCode = roomRes.roomCode;
        roomId = roomRes.roomId;
        hostCreds.playerId = roomRes.playerId;
        hostCreds.sessionToken = roomRes.sessionToken;

        // Register Challenger
        challenger.emit("register_session", {}, (chalRes: any) => {
          challengerCreds = chalRes;
          // Join Room
          challenger.emit("join_room", {
            roomCode,
            username: `Bot_Chal_${roomIdIdx}`,
            playerId: challengerCreds.playerId,
            sessionToken: challengerCreds.sessionToken
          }, (joinRes: any) => {
            challengerCreds.playerId = joinRes.playerId;
            challengerCreds.sessionToken = joinRes.sessionToken;

            // Submit initial secrets
            submitSecrets();
          });
        });
      });
    });

    function submitSecrets() {
      hostBoard = ["_", "_", "_", "_"];
      challengerBoard = ["_", "_", "_", "_"];
      hostGuessed.clear();
      challengerGuessed.clear();

      const hostSecret = random4Digits();
      const challengerSecret = random4Digits();

      stats.totalMatchesStarted++;

      host.emit("submit_secret", {
        roomId,
        playerId: hostCreds.playerId,
        sessionToken: hostCreds.sessionToken,
        secret: hostSecret
      });

      challenger.emit("submit_secret", {
        roomId,
        playerId: challengerCreds.playerId,
        sessionToken: challengerCreds.sessionToken,
        secret: challengerSecret
      });
    }

    // Handlers for active gameplay
    host.on("game_started", (data: any) => {
      currentTurnSlot = data.firstTurnSlot;
      if (currentTurnSlot === 1) {
        const guess = generateStrategicGuess(hostBoard, hostGuessed);
        host.emit("submit_guess", {
          roomId,
          playerId: hostCreds.playerId,
          sessionToken: hostCreds.sessionToken,
          guess
        });
      }
    });

    challenger.on("game_started", (data: any) => {
      currentTurnSlot = data.firstTurnSlot;
      if (currentTurnSlot === 2) {
        const guess = generateStrategicGuess(challengerBoard, challengerGuessed);
        challenger.emit("submit_guess", {
          roomId,
          playerId: challengerCreds.playerId,
          sessionToken: challengerCreds.sessionToken,
          guess
        });
      }
    });

    host.on("turn_changed", (data: any) => {
      currentTurnSlot = data.currentTurnSlot;
      if (currentTurnSlot === 1) {
        const guess = generateStrategicGuess(hostBoard, hostGuessed);
        host.emit("submit_guess", {
          roomId,
          playerId: hostCreds.playerId,
          sessionToken: hostCreds.sessionToken,
          guess
        });
      }
    });

    challenger.on("turn_changed", (data: any) => {
      currentTurnSlot = data.currentTurnSlot;
      if (currentTurnSlot === 2) {
        const guess = generateStrategicGuess(challengerBoard, challengerGuessed);
        challenger.emit("submit_guess", {
          roomId,
          playerId: challengerCreds.playerId,
          sessionToken: challengerCreds.sessionToken,
          guess
        });
      }
    });

    host.on("guess_result", (data: any) => {
      stats.totalGuesses++;
      if (data.playerSlot === 1) {
        hostBoard = data.revealedBoard;
      } else {
        challengerBoard = data.revealedBoard;
      }
    });

    challenger.on("guess_result", (data: any) => {
      if (data.playerSlot === 1) {
        hostBoard = data.revealedBoard;
      } else {
        challengerBoard = data.revealedBoard;
      }
    });

    // Rematch triggers on completion
    host.on("rematch_accepted", () => {
      submitSecrets();
    });

    const onGameFinished = (data: MatchResult) => {
      stats.totalMatchesCompleted++;
      if (data.winnerSlot === 1) stats.p1Wins++;
      else stats.p2Wins++;

      stats.turnCounts.push(data.turnCount);
      stats.durations.push(data.durationSec);

      matchesRemaining--;

      if (matchesRemaining > 0) {
        // Request rematch
        host.emit("request_rematch", {
          roomId,
          playerId: hostCreds.playerId,
          sessionToken: hostCreds.sessionToken
        });
        challenger.emit("request_rematch", {
          roomId,
          playerId: challengerCreds.playerId,
          sessionToken: challengerCreds.sessionToken
        });
      } else {
        // All matches completed for this room
        host.disconnect();
        challenger.disconnect();
        resolve();
      }
    };

    // Make sure we only register finished once per client to avoid double counting
    host.on("game_finished", onGameFinished);
  });
}

/**
 * Main Orchestrator running hundreds of games.
 */
async function runSimulationOrchestrator() {
  console.log("===============================================================");
  console.log("🎮 STARTING THE MASSIVE MULTIPLAYER BOT SIMULATOR (100+ GAMES)");
  console.log("===============================================================");

  const startTime = Date.now();
  const roomsCount = 30; // 30 concurrent rooms
  const matchesPerRoom = 5; // 5 matches per room = 150 total matches!

  console.log(`[Simulator] Initializing ${roomsCount} parallel arenas...`);
  console.log(`[Simulator] Target: ${roomsCount * matchesPerRoom} total matches.`);

  const roomPromises = Array.from({ length: roomsCount }).map((_, idx) => {
    return runRoomSession(idx, matchesPerRoom);
  });

  await Promise.all(roomPromises);

  const durationSec = (Date.now() - startTime) / 1000;
  console.log("\n===============================================================");
  console.log("🏆 SIMULATION FULLY COMPLETED IN", durationSec.toFixed(2), "SECONDS!");
  console.log("===============================================================");

  // Output stats
  const avgTurns = stats.turnCounts.reduce((a, b) => a + b, 0) / stats.turnCounts.length;
  console.log(`📊 Total Matches Attempted:  ${stats.totalMatchesStarted}`);
  console.log(`📊 Total Matches Completed:  ${stats.totalMatchesCompleted}`);
  console.log(`📊 Player 1 (Host) Wins:     ${stats.p1Wins}`);
  console.log(`📊 Player 2 (Challenger) Wins: ${stats.p2Wins}`);
  console.log(`📊 Total Guesses Made:       ${stats.totalGuesses}`);
  console.log(`📊 Average Turns Per Game:   ${avgTurns.toFixed(2)}`);
  console.log(`📊 Total Errors Logged:      ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log("⚠️ Errors details:", JSON.stringify(stats.errors.slice(0, 5), null, 2));
  }
}

runSimulationOrchestrator().catch(console.error);
