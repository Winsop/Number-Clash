# 08_TESTING

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-08 |
| **Title** | Testing Strategy & QA Methodologies |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | QA Engineers, Integration Testers, Developers |

---

## 2. Testing Strategy & Philosophy

The testing strategy for **Number Clash** ensures high reliability, particularly regarding turn logic, game states, and reconnection rules, preventing any visual or logic errors.

```
┌────────────────────────────────────────────────────────┐
│                    TESTING PYRAMID                     │
├────────────────────────────────────────────────────────┤
│  [E2E / Socket Integration] (30%) ──► Multi-Client Syncs │
│  [Integration Tests]        (40%) ──► DB Transactions   │
│  [Unit Tests]               (30%) ──► Matching Engine   │
└────────────────────────────────────────────────────────┘
```

---

## 3. Unit Testing Matrix (Matching Engine)

Unit tests focus on the position-only feedback calculations, covering edge cases like repeated digits and index boundaries.

### 3.1 Test Scenarios & Expectations
The unit tests must validate the following inputs against the `evaluateGuess` function:

| Test Case ID | Opponent Secret ($S$) | Guess ($G$) | Previous Discoveries ($D_{prev}$) | Expected Newly Revealed ($D_{new}$) | Expected Revealed Board ($D_{total}$) | Expected Count |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-001** | `"1234"` | `"5678"` | `[]` | `[]` | `["_", "_", "_", "_"]` | `0` | No matches. |
| **TC-002** | `"1234"` | `"1678"` | `[]` | `[0]` | `["1", "_", "_", "_"]` | `1` | Single match at start. |
| **TC-003** | `"1234"` | `"1278"` | `[0]` | `[1]` | `["1", "2", "_", "_"]` | `2` | Index 0 already locked; index 1 newly revealed. |
| **TC-004** | `"1111"` | `"1221"` | `[]` | `[0, 3]` | `["1", "_", "_", "1"]` | `2` | Repeated digit matching on indices 0 and 3. |
| **TC-005** | `"0000"` | `"0000"` | `[0, 1]` | `[2, 3]` | `["0", "0", "0", "0"]` | `4` | Double match on remaining slots, triggering victory. |

### 3.2 Sample Jest/Vitest Implementation

```typescript
import { describe, it, expect } from "vitest";
import { evaluateGuess } from "../shared/validation";

describe("evaluateGuess Algorithm Tests", () => {
  it("TC-001: should return zero matches when guess shares no common indices", () => {
    const result = evaluateGuess({
      guess: "5678",
      opponentSecret: "1234",
      previouslyRevealed: []
    });
    expect(result.newlyRevealed).toEqual([]);
    expect(result.revealedBoard).toEqual(["_", "_", "_", "_"]);
    expect(result.isComplete).toBe(false);
  });

  it("TC-002: should reveal single index and mark incomplete", () => {
    const result = evaluateGuess({
      guess: "1678",
      opponentSecret: "1234",
      previouslyRevealed: []
    });
    expect(result.newlyRevealed).toEqual([0]);
    expect(result.revealedBoard).toEqual(["1", "_", "_", "_"]);
    expect(result.isComplete).toBe(false);
  });

  it("TC-003: should skip previously revealed indices", () => {
    const result = evaluateGuess({
      guess: "1278",
      opponentSecret: "1234",
      previouslyRevealed: [0]
    });
    expect(result.newlyRevealed).toEqual([1]);
    expect(result.revealedBoard).toEqual(["1", "2", "_", "_"]);
  });

  it("TC-004: should handle repeated digits accurately", () => {
    const result = evaluateGuess({
      guess: "1221",
      opponentSecret: "1111",
      previouslyRevealed: []
    });
    expect(result.newlyRevealed).toEqual([0, 3]);
  });
});
```

---

## 4. Socket Integration & Synchronization Tests

Socket tests verify that the server coordinates state transitions and manages rooms correctly.

### 4.1 Mock Client Integration Script
Using `socket.io-client` in a test suite, mock two separate clients to simulate a complete game loop.

```typescript
import { io, Socket } from "socket.io-client";
import { createServer } from "http";
import { Server } from "socket.io";

describe("Socket Integration Flow", () => {
  let ioServer: Server;
  let client1: Socket;
  let client2: Socket;
  let serverUrl = "http://localhost:3000";

  beforeAll((done) => {
    // Start mock testing server here
    done();
  });

  afterAll(() => {
    client1.disconnect();
    client2.disconnect();
    ioServer.close();
  });

  it("should complete a full setup and turn sequence", (done) => {
    client1 = io(serverUrl);
    client2 = io(serverUrl);

    client1.on("connect", () => {
      client1.emit("create_room", { turnTimerSec: null });
    });

    client1.on("room_created", (payload) => {
      const roomCode = payload.roomCode;
      client2.emit("join_room", { roomCode });
    });

    client2.on("player_joined", () => {
      client1.emit("submit_secret", { secret: "1234" });
      client2.emit("submit_secret", { secret: "5678" });
    });

    client1.on("game_started", () => {
      client1.emit("submit_guess", { guess: "5000" });
    });

    client1.on("guess_result", (result) => {
      expect(result.newlyRevealed).toEqual([0]); // '5' matches index 0 of '5678'
      done();
    });
  });
});
```

---

## 5. Manual QA Verification Matrix

Manual testers should follow these scenarios to verify user-facing behavior:

| Scenario Code | Title | Step-by-Step Instructions | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **QA-MAN-001** | **Input Box Focus Auto-Advance** | Navigate to Secret Entry Screen. Click Cell 0. Type '5'. | Focus advances automatically to Cell 1. Cell 0 displays dot character. | |
| **QA-MAN-002** | **Input Box Focus Auto-Retreat** | Press Backspace inside empty Cell 2. | Focus retreats to Cell 1. Cell 1 value is cleared. | |
| **QA-MAN-003** | **Turn Lockout Enforcements** | Open match on two browsers. Attempt to submit a guess using Player 2's browser during Player 1's turn. | Submit button is disabled for Player 2, and any manual socket triggers return a `NOT_YOUR_TURN` error. | |
| **QA-MAN-004** | **Reconnection Banner Trigger** | Start playing. Disconnect Player 1's network. | Player 2 sees the Disconnect Banner with a live 120s countdown. | |
| **QA-MAN-005** | **120s Grace Period Expiration** | Start playing. Disconnect Player 1. Allow the 120s timer to run out. | Player 2 is notified of an early victory, and the room transitions to `CLOSED`. | |

---

## 6. Performance & Scale Testing Boundaries

*   **Target Capacity:** A single server node must comfortably support **500 concurrent rooms** (1,000 active players) with an average latency of under **100ms** per guess event.
*   **Load Testing Strategy:** Use `artillery` or `k6` to simulate high-concurrency socket traffic.
*   **Metrics of Concern:** Memory usage (leak detection in closed rooms) and CPU load during simultaneous timers.

---

## 7. Document References

*   *Deduction mechanics and feedback rules:* [01_GAME_RULES.md](01_GAME_RULES.md)
*   *WebSocket schemas and payloads:* [04_SOCKET_EVENTS.md](04_SOCKET_EVENTS.md)
*   *Frontend spec and UI elements:* [07_FRONTEND_SPEC.md](07_FRONTEND_SPEC.md)
