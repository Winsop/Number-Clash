# 04_SOCKET_EVENTS

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-04 |
| **Title** | Socket.IO Event Contract & Network Protocols |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Frontend Engineers, Backend Developers, Integration Testers |

---

## 2. Executive Summary & Purpose

### 2.1 Purpose
This document specifies the communication contract for all real-time events exchanged over WebSockets via Socket.IO between the Number Clash client and server. This document serves as the absolute single source of truth for the real-time networking layer, preventing serialization mismatches and silent integration drift.

### 2.2 Network Philosophy
*   **Dry Principle:** Event names and structural types must be defined in the `/shared` directory (`shared/events.ts` and `shared/types.ts`) and imported directly by both client and server codebases.
*   **Security Principle:** The server must validate all socket connections. No sensitive state (such as the opponent's secret key) is transmitted to the client except during the terminal `game_finished` event.

---

## 3. Connection & Authentication Protocol

### 3.1 Initial Handshake
Upon establishing a WebSocket connection, the socket client must register its connection with the server. A guest session is initialized, and the client receives a cryptographically secure `sessionToken` and `playerId`.

### 3.2 Secure Multi-Tenant Architecture
Every socket message representing an active gameplay action (e.g., submitting guesses, entering secrets, or requesting a rematch) must be authenticated by supplying a uniform envelope payload containing:
*   `roomId`: The unique room identifier string.
*   `playerId`: The unique player identifier.
*   `sessionToken`: A private token issued during joining to prevent spoofing.

---

## 4. Socket.IO Event Contract Map

The relationship between client triggers, backend validation, and broadcast responses is mapped below.

```
       CLIENT                                          SERVER
         │                                               │
         ├────────────── [create_room] ─────────────────►│
         ◄────────────── [room_created] ─────────────────┤
         │                                               │
         ├─────────────── [join_room] ──────────────────►│
         ◄─────────────── [player_joined] ───────────────┤ (Broadcasts to Room)
         │                                               │
         ├───────────── [submit_secret] ────────────────►│
         ◄─────────────── [game_started] ────────────────┤ (When both submit)
         │                                               │
         ├────────────── [submit_guess] ────────────────►│
         ◄─────────────── [guess_result] ────────────────┤ (Broadcasts to both)
         ◄─────────────── [turn_changed] ────────────────┤ (Broadcasts to both)
         │                                               │
         ├───────────── [request_rematch] ──────────────►│
         ◄─────────────── [room_closed] ─────────────────┤ (If declined/expired)
```

---

## 5. Client-to-Server Event Schema (C2S)

These events are emitted exclusively by the client and processed by the authoritative backend.

### 5.1 `create_room`
*   **Purpose:** Initializes a new room instance on the server.
*   **Payload:**
    ```typescript
    interface CreateRoomPayload {
      turnTimerSec: number | null; // null = No Timer. Allowed: 30, 60, 90.
    }
    ```
*   **Validation:** `turnTimerSec` must be exactly `null`, `30`, `60`, or `90`. Reject malformed configuration values immediately.
*   **Success Response:** Server emits `room_created` to the initiator.
*   **Error Response:** Emits `error` with code `INVALID_CONFIG`.

### 5.2 `join_room`
*   **Purpose:** Associates a player with an existing room.
*   **Payload:**
    ```typescript
    interface JoinRoomPayload {
      roomCode: string; // 6-character unique alphanumeric room code
      username?: string; // Optional user-chosen handle (max 15 chars)
    }
    ```
*   **Validation:** `roomCode` must exist and be in status `CREATED` or `WAITING_FOR_PLAYER`. User handle must be stripped of HTML tags and contain only alphanumeric characters.
*   **Success Response:** Server joins the client socket to the room room-channel, issues a session token, and broadcasts `player_joined` to the room.

### 5.3 `submit_secret`
*   **Purpose:** Locks in the player's 4-digit secret key at match startup.
*   **Payload:**
    ```typescript
    interface SubmitSecretPayload {
      roomId: string;
      playerId: string;
      sessionToken: string;
      secret: string; // Exact 4-digit string
    }
    ```
*   **Validation:** Validate session token. `secret` must consist of exactly 4 characters matching `/^\d{4}$/`.
*   **Success Response:** If both secrets are locked, the server transition-broadcasts `game_started`.

### 5.4 `submit_guess`
*   **Purpose:** Submits an active turn's 4-digit guess.
*   **Payload:**
    ```typescript
    interface SubmitGuessPayload {
      roomId: string;
      playerId: string;
      sessionToken: string;
      guess: string; // Exact 4-digit string
    }
    ```
*   **Validation:** Validate session token. Ensure `currentTurnSlot` matches the sender's active slot. Ensure `guess` matches `/^\d{4}$/`. Check that match state is active (`PLAYING`).
*   **Success Response:** Evaluates feedback, broadcasts `guess_result` and `turn_changed` (or `game_finished` if final digits are locked).

### 5.5 `request_rematch`
*   **Purpose:** Flags willingness to start a new game in the same room.
*   **Payload:**
    ```typescript
    interface RequestRematchPayload {
      roomId: string;
      playerId: string;
      sessionToken: string;
    }
    ```
*   **Validation:** Validate session token. Room must be in status `GAME_FINISHED` or `REMATCH_PENDING`.
*   **Success Response:** Broadcasts `player_joined` (with rematch indicator) or transition-starts a new game if both accept.

### 5.6 `leave_room`
*   **Purpose:** Explicitly exits a room.
*   **Payload:**
    ```typescript
    interface LeaveRoomPayload {
      roomId: string;
      playerId: string;
      sessionToken: string;
    }
    ```
*   **Validation:** Validate session token.
*   **Success Response:** Server disconnects the client, transitions the room to `CLOSED`, and emits `room_closed` to the remaining player.

---

## 6. Server-to-Client Event Schema (S2C)

These events are pushed by the authoritative backend to synchronize active clients.

### 6.1 `room_created`
*   **Purpose:** Notifies the room creator of initialization success.
*   **Recipient:** Creator Client
*   **Payload:**
    ```typescript
    interface RoomCreatedPayload {
      roomCode: string; // e.g. "X7Y12A"
      playerId: string; // Secure ID assigned to the creator
      sessionToken: string; // Verification token for subsequent events
      slot: number; // Will always be 1
    }
    ```

### 6.2 `player_joined`
*   **Purpose:** Notifies room occupants of client joins.
*   **Recipient:** Room Channel
*   **Payload:**
    ```typescript
    interface PlayerJoinedPayload {
      slot: number; // 1 or 2
      username: string; // e.g., "Guest#1024" or registered handle
      joinedCount: number; // Count of players currently joined (1 or 2)
    }
    ```

### 6.3 `game_started`
*   **Purpose:** Signifies that both players entered their secrets and gameplay has commenced.
*   **Recipient:** Room Channel
*   **Payload:**
    ```typescript
    interface GameStartedPayload {
      turnTimerSec: number | null;
      firstTurnSlot: number; // Will always be 1
      timerEndsAt: string | null; // ISO Timestamp if timer is configured
    }
    ```

### 6.4 `turn_changed`
*   **Purpose:** Advances turn ownership and resets active timers.
*   **Recipient:** Room Channel
*   **Payload:**
    ```typescript
    interface TurnChangedPayload {
      currentTurnSlot: number; // Slot active (1 or 2)
      turnNumber: number; // Sequence tracker
      timerEndsAt: string | null; // ISO UTC Timestamp representing when the turn ends
    }
    ```

### 6.5 `guess_result`
*   **Purpose:** Broadcasts turn feedback to both players simultaneously.
*   **Recipient:** Room Channel
*   **Payload:**
    ```typescript
    interface GuessResultPayload {
      playerSlot: number; // The slot of the player who made the guess
      guess: string; // The 4-digit guess submitted
      correctPosition: number; // Count of locked positions (0 to 4)
      newlyRevealed: number[]; // e.g., [1, 3] indicating indices discovered in this turn
      revealedBoard: string[]; // e.g. ["_", "1", "_", "4"] indicating total locked state of the target secret
    }
    ```
*   **Critical Security Implementation:** When sending to a player's client, the server must sanitize the payload: `revealedBoard` returned to Player $X$ must represent Player $X$'s discoveries about the opponent's secret, not their own.

### 6.6 `game_finished`
*   **Purpose:** Concludes a game, declaring a winner and revealing secrets.
*   **Recipient:** Room Channel
*   **Payload:**
    ```typescript
    interface GameFinishedPayload {
      winnerSlot: number; // 1 or 2
      player1Secret: string; // Revealed raw secret key of Player 1
      player2Secret: string; // Revealed raw secret key of Player 2
      durationSec: number; // Time elapsed since game_started
      turnCount: number; // Total turn cycles completed
    }
    ```

### 6.7 `player_disconnected`
*   **Purpose:** Alerts a player that their opponent has dropped connection.
*   **Recipient:** Room Channel (Remaining Player)
*   **Payload:**
    ```typescript
    interface PlayerDisconnectedPayload {
      slot: number; // The slot of the disconnected player
      graceEndsAt: string; // ISO Timestamp representing when the 120s reconnection window expires
    }
    ```

### 6.8 `room_closed`
*   **Purpose:** Explicitly tears down the active game.
*   **Recipient:** Room Channel
*   **Payload:**
    ```typescript
    interface RoomClosedPayload {
      reason: "LEAVE" | "ABANDONED" | "TTL_EXPIRY";
      message: string;
    }
    ```

---

## 7. Socket Error Taxonomy

When an error occurs, the server must emit a unified structured error packet over the standard `error` socket channel instead of raising general application crashes.

```typescript
interface SocketErrorPayload {
  code: string; // Standard error identifier code
  message: string; // Human-readable error description
}
```

The table below outlines the definitive error registry for Number Clash v1:

| Error Code | Class | Description | Expected Client Handling |
| :--- | :--- | :--- | :--- |
| `INVALID_ROOM` | Validation | The target room code does not exist. | Return user to home screen with warning toast. |
| `ROOM_FULL` | Matchmaking | The room code corresponds to a lobby containing 2 players. | Notify user, reset inputs, preserve home state. |
| `ROOM_EXPIRED` | Lifecycle | Room closed due to inactivity or shutdown. | Direct user to create a new room. |
| `NOT_YOUR_TURN` | Gameplay | Guest submitted guess out of sequence. | Log warning, re-disable inputs, sync local timers. |
| `INVALID_GUESS` | Validation | Guess violates character set or length. | Visually highlight input cell boundary in red. |
| `ALREADY_GUESSED` | Validation | Input matches a duplicate guess this turn. | Alert user that no new data can be discovered. |
| `RECONNECT_FAILED` | Connectivity | Grace period expired or session token is invalid. | Purge local session tokens and return to home. |
| `UNAUTHORIZED` | Security | Action attempted with an incorrect session token. | Log security audit, hard-refresh socket connection. |

---

## 8. Network Edge Cases & Mitigations

### 8.1 Symmetrical Message Race Conditions
*   **Scenario:** Player A submits a guess exactly at the millisecond Player A's local countdown hits `0`, while the server has concurrently processed a timeout event.
*   **Mitigation:** The server's clock is the absolute arbiter. If the server's timeout timer resolves first, it locks turn input for Player A, emits a `turn_changed` event, and ignores the guess payload. When the client receives `turn_changed`, it clears Player A's active input buffer.

### 8.2 Stale State Restorations
*   **Scenario:** A client reconnects after 90 seconds of network downtime. During this period, the opponent received 2 turns due to automated timer skips.
*   **Mitigation:** Upon reconnection handshake validation, the server does not rely on the client's cached historical logs. Instead, it compiles a complete historical catch-up state (the array of all past guesses, revealed boards, and timers) and pushes a comprehensive, structural `reconnect_sync` state event to the client before unlocking any inputs.

---

## 9. Document References

*   *Gameplay evaluation logic:* [01_GAME_RULES.md](01_GAME_RULES.md)
*   *Systems topology and network gateways:* [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md)
*   *Database triggers resulting from event persistence:* [03_DATABASE_SCHEMA.md](03_DATABASE_SCHEMA.md)
*   *React-side socket hook structure:* [07_FRONTEND_SPEC.md](07_FRONTEND_SPEC.md)
