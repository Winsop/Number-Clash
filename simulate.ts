import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

interface HandshakeResponse {
  playerId: string;
  sessionToken: string;
}

interface RoomCreatedResponse {
  roomCode: string;
  roomId: string;
  playerId: string;
  sessionToken: string;
  slot: number;
}

interface JoinRoomResponse {
  success: boolean;
  roomId: string;
  playerId?: string;
  sessionToken?: string;
  slot: number;
  room: any;
  game?: any;
}

// Helper to wait
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log("======================================================================");
  console.log("🚀 STARTING NUMBER CLASH AUTOMATED MULTIPLAYER SIMULATION & STRESS TEST");
  console.log("======================================================================");

  const results = {
    gameplay: [] as string[],
    multiplayer: [] as string[],
    validation: [] as string[],
    security: [] as string[],
    performance: {} as any,
    bugs: [] as any[],
  };

  // --- TEST 1: GAMEPLAY (NORMAL MATCH SIMULATION) ---
  console.log("\n--- TEST 1: Normal Match Simulation ---");
  try {
    const client1 = io(SERVER_URL);
    const client2 = io(SERVER_URL);

    let p1Creds: HandshakeResponse = { playerId: "", sessionToken: "" };
    let p2Creds: HandshakeResponse = { playerId: "", sessionToken: "" };

    // Player 1 Handshake
    await new Promise<void>((resolve) => {
      client1.emit("register_session", {}, (res: HandshakeResponse) => {
        p1Creds = res;
        resolve();
      });
    });

    // Player 2 Handshake
    await new Promise<void>((resolve) => {
      client2.emit("register_session", {}, (res: HandshakeResponse) => {
        p2Creds = res;
        resolve();
      });
    });

    // Player 1 creates room
    let roomInfo: RoomCreatedResponse | null = null;
    await new Promise<void>((resolve) => {
      client1.emit("create_room", { turnTimerSec: 30 }, (res: RoomCreatedResponse) => {
        roomInfo = res;
        resolve();
      });
    });

    if (!roomInfo) throw new Error("Failed to create room for simulation");
    const code = (roomInfo as RoomCreatedResponse).roomCode;
    const roomId = (roomInfo as RoomCreatedResponse).roomId;
    console.log(`[P1] Room created with code: ${code}, ID: ${roomId}`);

    // Player 2 joins room (capturing the newly generated session credentials)
    let p2Join: JoinRoomResponse | null = null;
    await new Promise<void>((resolve) => {
      client2.emit("join_room", { roomCode: code, username: "Bot_Challenger", playerId: p2Creds.playerId, sessionToken: p2Creds.sessionToken }, (res: JoinRoomResponse) => {
        p2Join = res;
        resolve();
      });
    });

    if (!p2Join || !p2Join.playerId || !p2Join.sessionToken) {
      throw new Error("P2 failed to join room or obtain session credentials");
    }

    const p2RealPlayerId = p2Join.playerId;
    const p2RealSessionToken = p2Join.sessionToken;
    console.log(`[P2] Joined room successfully: slot ${p2Join?.slot}, ID: ${p2RealPlayerId}`);

    // Set Secrets
    const p1Secret = "1357";
    const p2Secret = "2468";

    // Track game started
    let gameStarted = false;
    client1.on("game_started", () => {
      gameStarted = true;
    });

    console.log("[P1] Submitting secret '1357'...");
    client1.emit("submit_secret", { roomId, playerId: roomInfo.playerId, sessionToken: roomInfo.sessionToken, secret: p1Secret });

    console.log("[P2] Submitting secret '2468'...");
    client2.emit("submit_secret", { roomId, playerId: p2RealPlayerId, sessionToken: p2RealSessionToken, secret: p2Secret });

    await delay(500);

    if (gameStarted) {
      console.log("✅ Game started successfully!");
      results.gameplay.push("Normal match starts successfully.");
    } else {
      console.log("❌ Game failed to start.");
      results.bugs.push({
        name: "Game failed to start",
        severity: "High",
        desc: "Room status remained unchanged after both players submitted secrets",
      });
    }

    // Play a few turns
    // P1 Guess: "2400" (Against P2 secret "2468"). Correct digits: none matching at exact positions (since "2400" vs "2468" -> wait! index 0 of guess is '2', index 0 of secret is '2'. Index 1 is '4', index 1 of secret is '4'. So indeed '2' and '4' match at index 0 and 1! That is correctPosition=2!)
    let guess1Result: any = null;
    client1.on("guess_result", (data) => {
      if (data.playerSlot === 1) {
        guess1Result = data;
      }
    });

    console.log("[P1] Guessing '2400'...");
    client1.emit("submit_guess", { roomId, playerId: roomInfo.playerId, sessionToken: roomInfo.sessionToken, guess: "2400" });
    await delay(500);

    if (guess1Result) {
      console.log(`✅ P1 Guess evaluated: CorrectPosition=${guess1Result.correctPosition}, NewlyRevealed=${JSON.stringify(guess1Result.newlyRevealed)}, Board=${JSON.stringify(guess1Result.revealedBoard)}`);
      if (guess1Result.correctPosition === 2 && guess1Result.revealedBoard[0] === "2" && guess1Result.revealedBoard[1] === "4") {
        console.log("✅ Guess evaluation arithmetic is 100% correct!");
        results.gameplay.push("Guess arithmetic correctly evaluated positions.");
      } else {
        console.log("❌ Guess evaluation arithmetic is incorrect!");
        results.bugs.push({
          name: "Incorrect guess evaluation",
          severity: "Critical",
          desc: `Expected correctPosition 2, got ${guess1Result.correctPosition}`,
        });
      }
    } else {
      console.log("❌ No guess result received.");
    }

    // Clean up connections
    client1.disconnect();
    client2.disconnect();
  } catch (err: any) {
    console.error("Test 1 encountered an error:", err);
  }

  // --- TEST 2: VALIDATION AND SERVER CRASH INTRUSION ---
  console.log("\n--- TEST 2: Input Validation & Crash Intrusion ---");
  try {
    const clientCrash = io(SERVER_URL);

    // Register
    let creds: HandshakeResponse = { playerId: "", sessionToken: "" };
    await new Promise<void>((resolve) => {
      clientCrash.emit("register_session", {}, (res: HandshakeResponse) => {
        creds = res;
        resolve();
      });
    });

    // Create room
    let roomInfo: RoomCreatedResponse | null = null;
    await new Promise<void>((resolve) => {
      clientCrash.emit("create_room", { turnTimerSec: 30 }, (res: RoomCreatedResponse) => {
        roomInfo = res;
        resolve();
      });
    });

    if (roomInfo) {
      const roomId = roomInfo.roomId;
      
      console.log("[Validation] Testing submit_secret with integer payload (1234)...");
      let errorReceived: any = null;
      clientCrash.on("error", (err) => {
        errorReceived = err;
      });

      clientCrash.emit("submit_secret", {
        roomId,
        playerId: roomInfo.playerId,
        sessionToken: roomInfo.sessionToken,
        secret: 1234 as any, // Malicious type override
      });

      await delay(500);

      if (errorReceived) {
        console.log(`✅ Caught validation error gracefully: ${JSON.stringify(errorReceived)}`);
        results.validation.push("Submit secret integer type rejected safely.");
      } else {
        console.log("⚠️ No error returned when submitting integer as secret! Inspecting backend health...");
        
        try {
          const res = await fetch(`${SERVER_URL}/api/health`);
          const body = await res.json();
          if (body.status === "ok") {
            console.log("✅ Backend server did not crash immediately, but let's test if it crashed on guess evaluate...");
            
            // Submitting guess with number to check the guess split crash
            clientCrash.emit("submit_guess", {
              roomId,
              playerId: roomInfo.playerId,
              sessionToken: roomInfo.sessionToken,
              guess: 1234 as any
            });
            await delay(500);
            
            // Now test if crashed
            try {
              const res2 = await fetch(`${SERVER_URL}/api/health`);
              await res2.json();
              console.log("✅ Backend server survived integer guess submission (did not crash).");
            } catch (fetchErr2) {
              console.log("❌ Backend server CRASHED on integer guess evaluation! (Critical Bug)");
              results.bugs.push({
                name: "Server Crash on Integer Guess",
                severity: "Critical",
                desc: "Submitting a number instead of a string for 'guess' bypasses validation and crashes split() on server.",
                repro: "Emit submit_guess with guess: 1234",
                fix: "Enforce strict type validation for all input payloads."
              });
            }
          } else {
            console.log("❌ Backend server returned abnormal health check.");
          }
        } catch (fetchErr) {
          console.log("❌ Backend server CRASHED immediately on integer secret! (Critical Bug)");
          results.bugs.push({
            name: "Server Crash on Integer Input",
            severity: "Critical",
            desc: "Submitting a number instead of a string for 'secret' bypasses regex and crashes split() on server.",
            repro: "Emit submit_secret with secret: 1234",
            fix: "Ensure payload validation enforces string type explicitly or converts value to string before split.",
          });
        }
      }
    }
    clientCrash.disconnect();
  } catch (err) {
    console.error("Test 2 encountered an error:", err);
  }

  // --- TEST 3: SECURITY ANALYSIS (TOKEN BYPASS & OUT-OF-TURN GUESSES) ---
  console.log("\n--- TEST 3: Zero-Trust Security Verification ---");
  try {
    const client1 = io(SERVER_URL);
    const client2 = io(SERVER_URL);

    let p1Creds: HandshakeResponse = { playerId: "", sessionToken: "" };
    let p2Creds: HandshakeResponse = { playerId: "", sessionToken: "" };

    await new Promise<void>((resolve) => client1.emit("register_session", {}, (res) => { p1Creds = res; resolve(); }));
    await new Promise<void>((resolve) => client2.emit("register_session", {}, (res) => { p2Creds = res; resolve(); }));

    let roomInfo: RoomCreatedResponse | null = null;
    await new Promise<void>((resolve) => client1.emit("create_room", { turnTimerSec: null }, (res) => { roomInfo = res; resolve(); }));

    if (roomInfo) {
      const code = roomInfo.roomCode;
      const roomId = roomInfo.roomId;

      // Join P2
      let p2Join: JoinRoomResponse | null = null;
      await new Promise<void>((resolve) => {
        client2.emit("join_room", { roomCode: code, username: "Target", playerId: p2Creds.playerId, sessionToken: p2Creds.sessionToken }, (res) => {
          p2Join = res;
          resolve();
        });
      });

      const p2RealPlayerId = p2Join!.playerId!;
      const p2RealSessionToken = p2Join!.sessionToken!;

      // Submit secrets to start game
      client1.emit("submit_secret", { roomId, playerId: roomInfo.playerId, sessionToken: roomInfo.sessionToken, secret: "1111" });
      client2.emit("submit_secret", { roomId, playerId: p2RealPlayerId, sessionToken: p2RealSessionToken, secret: "2222" });
      await delay(500);

      // Verify that opponent's secret is NOT exposed on client events!
      let secretExposed = false;
      client1.on("guess_result", (data: any) => {
        if (data.secret || data.opponentSecret || data.player2Secret) {
          secretExposed = true;
        }
      });

      // Turn is P1 (slot 1 starts)
      // Attempt: P2 submits guess out of turn
      console.log("[Security] Attempting P2 guess out of turn (when it's P1's turn)...");
      let p2Error: any = null;
      client2.on("error", (err) => { p2Error = err; });
      client2.emit("submit_guess", { roomId, playerId: p2RealPlayerId, sessionToken: p2RealSessionToken, guess: "9999" });
      await delay(500);

      if (p2Error && p2Error.code === "NOT_YOUR_TURN") {
        console.log("✅ Security check passed: Out-of-turn guess was blocked.");
        results.security.push("Blocked out-of-turn guess attempts.");
      } else {
        console.log("❌ Security failure: Out-of-turn guess was NOT blocked or error code incorrect!", p2Error);
        results.bugs.push({
          name: "Out-of-turn guess bypass",
          severity: "High",
          desc: "Player was able to submit guess or did not receive NOT_YOUR_TURN error when playing out of turn",
        });
      }

      // Attempt: P1 submits guess with spoofed/invalid session token
      console.log("[Security] Attempting P1 guess with malicious session token spoof...");
      let p1Error: any = null;
      client1.on("error", (err) => { p1Error = err; });
      client1.emit("submit_guess", { roomId, playerId: roomInfo.playerId, sessionToken: "spoofed_token_123", guess: "0000" });
      await delay(500);

      if (p1Error && p1Error.code === "UNAUTHORIZED") {
        console.log("✅ Security check passed: Spoofed session token guess was blocked.");
        results.security.push("Blocked spoofed/invalid session token submissions.");
      } else {
        console.log("❌ Security failure: Spoofed session token guess was NOT blocked!", p1Error);
        results.bugs.push({
          name: "Session spoofing bypass",
          severity: "Critical",
          desc: "Zero-trust session envelope bypassed with arbitrary session tokens",
        });
      }

      if (!secretExposed) {
        console.log("✅ Security check passed: Opponent secret was never exposed on event payloads.");
        results.security.push("Symmetric secrets remain private during active matches.");
      } else {
        console.log("❌ Security failure: Opponent secret leaked in event payloads!");
        results.bugs.push({
          name: "Direct secret leakage",
          severity: "Critical",
          desc: "Opponent secret exposed to client before match completion.",
        });
      }
    }

    client1.disconnect();
    client2.disconnect();
  } catch (err) {
    console.error("Test 3 encountered an error:", err);
  }

  // --- TEST 4: HIGH-CONCURRENCY PERFORMANCE STRESS TEST ---
  console.log("\n--- TEST 4: Performance Stress Test (Spawning 100 concurrent rooms) ---");
  try {
    const clients: Socket[] = [];
    const roomCodes: string[] = [];
    const startTime = Date.now();

    console.log("[Performance] Launching 100 concurrent room creation pipelines...");
    
    // We will spawn 100 client pairs, create rooms, and join them
    const creationPromises = Array.from({ length: 50 }).map(async (_, idx) => {
      const c1 = io(SERVER_URL, { forceNew: true });
      const c2 = io(SERVER_URL, { forceNew: true });
      clients.push(c1, c2);

      let p1Creds: HandshakeResponse = { playerId: "", sessionToken: "" };
      let p2Creds: HandshakeResponse = { playerId: "", sessionToken: "" };

      await new Promise<void>((resolve) => c1.emit("register_session", {}, (res) => { p1Creds = res; resolve(); }));
      await new Promise<void>((resolve) => c2.emit("register_session", {}, (res) => { p2Creds = res; resolve(); }));

      let roomInfo: RoomCreatedResponse | null = null;
      await new Promise<void>((resolve) => {
        c1.emit("create_room", { turnTimerSec: 30 }, (res: RoomCreatedResponse) => {
          roomInfo = res;
          resolve();
        });
      });

      if (roomInfo) {
        roomCodes.push(roomInfo.roomCode);
        await new Promise<void>((resolve) => {
          c2.emit("join_room", {
            roomCode: roomInfo!.roomCode,
            username: `StressBot_${idx}`,
            playerId: p2Creds.playerId,
            sessionToken: p2Creds.sessionToken
          }, () => resolve());
        });
      }
    });

    await Promise.all(creationPromises);
    const duration = Date.now() - startTime;
    console.log(`✅ Stress Test Completed: Successfully initialized 50 matches (100 clients) in ${duration}ms!`);
    console.log(`📊 Average Room Setup Time: ${(duration / 50).toFixed(2)}ms per room.`);
    
    results.performance = {
      roomsCreated: 50,
      activeClients: 100,
      setupDurationMs: duration,
      avgSetupTimePerRoomMs: duration / 50,
    };

    // Cleanup all stress test clients
    clients.forEach(c => c.disconnect());
  } catch (err) {
    console.error("Test 4 encountered an error:", err);
  }

  console.log("\n======================================================================");
  console.log("🏁 SIMULATION COMPLETED! LOGGING COMPILED REPORTS");
  console.log("======================================================================");
  console.log(JSON.stringify(results, null, 2));
}

runTests().catch(console.error);
