# 06_BACKEND_SPEC

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-06 |
| **Title** | Authoritative Backend Specification |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Backend Engineers, Integration Testers, Systems Administrators |

---

## 2. Executive Summary & Purpose

### 2.1 Purpose
This document specifies the internal class structures, software modules, service boundaries, and state cleanup engines for the authoritative **Number Clash** Node.js Express backend. It provides developer instructions for implementing key services, handling concurrency, and maintaining database synchronization.

### 2.2 Backend Principles
The backend acts as the sole arbiter of gameplay. It must:
*   Enforce turn integrity, timers, and validation without trusting the client.
*   Safeguard all secrets, ensuring they are only revealed upon game completion.
*   Remain stateless where possible, allowing future horizontal scaling via database state synchronization and Redis.

---

## 3. Core Class & Modular Architecture

The backend consists of four main functional services, coordinated by the main Socket.IO server loop.

```
       ┌────────────────────────────────────────────────────────┐
       │                Socket.IO Entry Controllers             │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                 Auth & Session Manager                 │
       │     Generates, validates, and manages session tokens   │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                     Room Manager                       │
       │   Manages player slots, matchmaking, and state syncs   │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                     Game Engine                        │
       │   Calculates guesses, locks turns, and manages timers  │
       └─────────────┬────────────────────────────┬─────────────┘
                     ▼                            ▼
       ┌────────────────────────┐    ┌────────────────────────┐
       │      Stats Manager     │    │      TTL Cleaner       │
       │ Writes records to DB   │    │ Sweeps expired sessions│
       └────────────────────────┘    └────────────────────────┘
```

---

## 4. Room Manager (`RoomManager`)

The `RoomManager` coordinates game creation, player entry, and room teardowns.

### 4.1 Cryptographically Secure Room Code Generation
Room codes must be easy to read and share while remaining secure against brute-force attacks.
*   **Format:** Exactly 6 uppercase alphanumeric characters.
*   **Alphabet:** `A-Z` and `0-9` (excluding easily confused characters like `I`, `1`, `O`, `0` for better UX).
*   **Algorithm:**
    ```typescript
    import { randomBytes } from "crypto";

    const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    export function generateRoomCode(): string {
      let code = "";
      const len = ROOM_CODE_ALPHABET.length;
      while (code.length < 6) {
        const byte = randomBytes(1)[0];
        if (byte < 256 - (256 % len)) {
          code += ROOM_CODE_ALPHABET[byte % len];
        }
      }
      return code;
    }
    ```

### 4.2 Room State Management & In-Memory Synchronization
The manager caches active matches in-memory to prevent database latency during fast gameplay loops. The in-memory cache is regularly synchronized with PostgreSQL.

```typescript
export interface ActiveRoomState {
  id: string;               // Database room ID
  roomCode: string;         // "NX8F92"
  turnTimerSec: number | null;
  status: "CREATED" | "WAITING_FOR_PLAYER" | "READY" | "PLAYING" | "GAME_FINISHED" | "CLOSED";
  players: {
    playerId: string;
    userId: string | null;
    sessionToken: string;
    username: string;
    slot: 1 | 2;
    connected: boolean;
  }[];
  activeGameId: string | null;
}
```

---

## 5. Authoritative Game Engine (`GameEngine`)

The `GameEngine` validates input formats, processes secret keys, evaluates guesses, and manages timers.

### 5.1 Validation and Guess Processing
*   **Input Filter:** Rejects values containing non-numeric characters, whitespaces, or letters.
*   **Game State Checks:** Verifies that the match is active (`IN_PROGRESS`) and that the sender matches `currentTurnSlot`.

### 5.2 Feedback Loop Implementation
The engine evaluates guesses index-by-index against the cached secrets, updating the player's board state.

```typescript
export interface EvaluateGuessInput {
  guess: string;
  opponentSecret: string;
  previouslyRevealed: number[];
}

export function evaluateGuess(input: EvaluateGuessInput) {
  const guessArr = input.guess.split("");
  const secretArr = input.opponentSecret.split("");
  const newlyRevealed: number[] = [];

  for (let i = 0; i < 4; i++) {
    if (guessArr[i] === secretArr[i] && !input.previouslyRevealed.includes(i)) {
      newlyRevealed.push(i);
    }
  }

  const updatedBoard = Array.from({ length: 4 }, (_, i) => 
    input.previouslyRevealed.includes(i) || newlyRevealed.includes(i) ? secretArr[i] : "_"
  );

  return {
    newlyRevealed,
    revealedBoard: updatedBoard,
    isComplete: !updatedBoard.includes("_")
  };
}
```

---

## 6. Session & Token Manager (`SessionManager`)

The `SessionManager` manages session lifecycles, ensuring players can only act within their assigned games.

### 6.1 Cryptographic Token Issuance
*   Upon creation or joining, the server issues a cryptographically secure token using `randomBytes(32).toString('hex')`.
*   This token is returned directly to the player's client via the initial handshake event and is never broadcast to other players.

### 6.2 Zero-Trust Event Authentication Middleware
*   Every incoming socket message is validated before processing.
*   **Security Checklist:**
    1.  Validate that `roomId` is active.
    2.  Validate that `playerId` exists within that room.
    3.  Validate that the incoming `sessionToken` matches the cached token for that player.
    4.  If any check fails, reject the action and emit an `UNAUTHORIZED` error back to the socket.

---

## 7. Statistics & History Aggregator (`StatsManager`)

The `StatsManager` writes match outcomes to PostgreSQL and maintains competitive records.

### 7.1 Canonical Sorting Strategy
To prevent duplicate records, player IDs are sorted lexicographically before writing to `battle_stats`.
*   Let Player A's ID be `usr_abc` and Player B's ID be `usr_xyz`.
*   The database record is identified by the composite unique index `player1Key="usr_abc"` and `player2Key="usr_xyz"`.
*   **Rule:** `player1Key` is always the lexicographically smaller ID of the two users, regardless of who created the room or won the game.

### 7.2 Database Transaction Aggregation
Upon game completion, the manager runs a database transaction to record the match history and update player statistics.

```typescript
export async function recordGameEnd(params: {
  gameId: string;
  winnerSlot: number;
  player1Id: string;
  player2Id: string;
  totalGuesses: number;
  durationSec: number;
}) {
  const [p1Key, p2Key] = [params.player1Id, params.player2Id].sort();
  const isP1Winner = params.winnerSlot === 1;

  await prisma.$transaction([
    // 1. Update Game Record status
    prisma.game.update({
      where: { id: params.gameId },
      data: {
        status: "FINISHED",
        winnerSlot: params.winnerSlot,
        endedAt: new Date(),
      }
    }),
    
    // 2. Upsert Head-to-Head stats in BattleStats
    prisma.battleStats.upsert({
      where: { player1Key_player2Key: { player1Key: p1Key, player2Key: p2Key } },
      create: {
        player1Key: p1Key,
        player2Key: p2Key,
        gamesPlayed: 1,
        winsPlayer1: isP1Winner ? 1 : 0,
        winsPlayer2: isP1Winner ? 0 : 1,
        currentStreak: 1,
        currentStreakOf: isP1Winner ? params.player1Id : params.player2Id,
        longestStreak: 1,
        longestStreakOf: isP1Winner ? params.player1Id : params.player2Id,
        totalGuesses: params.totalGuesses,
        averageGuesses: params.totalGuesses,
        averageDurationSec: params.durationSec,
        fastestVictorySec: params.durationSec,
        slowestVictorySec: params.durationSec,
      },
      update: {
        gamesPlayed: { increment: 1 },
        winsPlayer1: { increment: isP1Winner ? 1 : 0 },
        winsPlayer2: { increment: isP1Winner ? 0 : 1 },
        // (Streak calculations occur here synchronously in SQL or JS transaction scope)
      }
    })
  ]);
}
```

---

## 8. Asynchronous TTL Room Cleaner

To prevent memory leaks from abandoned lobbies or connection drops, the backend runs a regular cleanup sweep.

*   **Mechanism:** Runs every 10 minutes using a server-side timer task.
*   **Cleanup Target:** Rooms in `CREATED` or `WAITING_FOR_PLAYER` states with no active connections for over **1 hour** are marked as `CLOSED`.
*   **Database Cascade:** Cascade deletion deletes corresponding `RoomPlayer` pivot rows and unused resources cleanly.

---

## 9. Rate Limiting Rules

To protect the server from spam or abuse, the following rate limits are enforced via middleware:

```
                  INCOMING CLIENT REQUEST / EVENT
                                │
                  IP or Session check within cache
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
         UNDER LIMIT                        EXCEEDS LIMIT
               │                                 │
         Allow request to                  Reject request with
         be processed                     429 HTTP or Socket Error
```

*   **Room Creation Limit:** Maximum 5 room creations per IP address per minute.
*   **Join Attempts Limit:** Maximum 20 lobby join requests per IP address per minute.
*   **Guess Limit:** Maximum 1 guess per second per session token.
*   **Chat Message Limit:** Maximum 5 chat lines per 10 seconds per session token.

---

## 10. Document References

*   *Deduction algorithms & feedback engine mechanics:* [01_GAME_RULES.md](01_GAME_RULES.md)
*   *Systems topology & network layout:* [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md)
*   *Prisma database entities & unique constraints:* [03_DATABASE_SCHEMA.md](03_DATABASE_SCHEMA.md)
*   *Full WebSockets Event specifications:* [04_SOCKET_EVENTS.md](04_SOCKET_EVENTS.md)
