# 01_GAME_RULES

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-01 |
| **Title** | Game Rules & Algorithms Specification |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Backend Engineers, Frontend Developers, QA Team |

---

## 2. Core Game Loop Overview

Number Clash is a symmetrical, real-time, 1v1 turn-based deduction game. The game is played over a series of alternating turns where players gather logical clues about their opponent's hidden 4-digit secret key while defending their own.

```
          ┌───────────────────────────────────────────────────┐
          │                    LOBBY SETUP                    │
          │  Players join and configure turn timer limit      │
          └─────────────────────────┬─────────────────────────┘
                                    ▼
          ┌───────────────────────────────────────────────────┐
          │               SECRET KEY SUBMISSION               │
          │  Both players secretly submit their 4-digit keys   │
          └─────────────────────────┬─────────────────────────┘
                                    ▼
          ┌───────────────────────────────────────────────────┐
          │                 ACTIVE TURNS LOOP                 │
          │  - Player submits 4-digit guess                   │
          │  - Server validates and calculates feedback       │
          │  - Correct index discoveries are permanently locked│
          │  - Turn alternates                                │
          └─────────────────────────┬─────────────────────────┘
                                    ▼
          ┌───────────────────────────────────────────────────┐
          │                    MATCH END                      │
          │  - All 4 positions locked by a player             │
          │  - Victory declared; opponent's secret revealed   │
          │  - Rematch or Lobby Return options enabled        │
          └───────────────────────────────────────────────────┘
```

---

## 3. Secret Key Specifications

At the beginning of a match, each player must select and submit a **Secret Key** that meets the following rigid validation requirements.

### 3.1 Validation Rules (Shared & Server-Authoritative)
1.  **Length:** Must be exactly four (4) characters.
2.  **Allowed Characters:** Must consist entirely of numeric ASCII characters (`0` through `9`). Special characters, letters, negative signs, decimal points, or whitespaces are strictly prohibited.
3.  **Leading Zeros:** Fully allowed (e.g., `0015` or `0920` are valid secret keys and are represented internally as distinct string instances, not integers).
4.  **Repeated Digits:** Fully allowed (e.g., `1111`, `1122`, or `0000` are completely valid).

### 3.2 UI Input Design
The client interface must present exactly four individual, auto-focusing numeric input cells. It must mask entries to prevent shoulder surfing (revealing characters momentarily during input is acceptable, but they must be replaced by bullet symbols `•` or asterisk symbols `*` immediately).

---

## 4. Feedback Algorithm (Position-Only Engine)

Number Clash v1 implements a **Position-Only Matching Engine**. Feedback is evaluated *index-by-index*. No "Bulls & Cows" elements (partial matches, e.g., correct digit in the wrong position) are computed or sent to the client.

### 4.1 Formal Logic & Mathematical Definition

Let:
*   $S = [s_0, s_1, s_2, s_3]$ be the Opponent's Secret Key, where each element $s_i \in \{'0'..'9'\}$.
*   $G = [g_0, g_1, g_2, g_3]$ be the Active Player's Guess, where each element $g_i \in \{'0'..'9'\}$.
*   $D_{prev} \subset \{0, 1, 2, 3\}$ be the set of indices that have already been **discovered** and locked by the active player in previous turns.
*   $D_{new}$ be the set of newly discovered indices resulting from the current guess $G$.
*   $D_{total}$ be the updated set of discovered indices.

For each index $i \in \{0, 1, 2, 3\}$:

$$D_{new} = \{ i \in \{0, 1, 2, 3\} \mid g_i = s_i \land i \notin D_{prev} \}$$

$$D_{total} = D_{prev} \cup D_{new}$$

The feedback payload sent to the active player's client contains:
1.  `correctPosition`: The count of correct indices discovered overall ($|D_{total}|$).
2.  `newlyRevealed`: The list of newly discovered indices ($D_{new}$).
3.  `revealedBoard`: A string representation of length 4, showing digits at discovered indices ($D_{total}$) and placeholders (e.g., `_` or `?`) at undiscovered indices.

### 4.2 Step-by-Step Code Representation (TypeScript)

The server must execute the following evaluation routine for every turn.

```typescript
interface GuessEvaluationInput {
  guess: string;        // e.g. "5004"
  secret: string;       // e.g. "1104"
  previouslyRevealed: number[]; // e.g. [2] (index 2 was already discovered)
}

interface GuessEvaluationResult {
  correctCount: number; // Total count of locked positions (0 to 4)
  newlyRevealed: number[]; // Indices revealed on this guess (e.g. [3])
  revealedBoard: string[]; // Board state: ["_", "_", "0", "4"]
}

export function evaluateGuess(input: GuessEvaluationInput): GuessEvaluationResult {
  const guessArr = input.guess.split("");
  const secretArr = input.secret.split("");
  
  const newlyRevealed: number[] = [];
  const revealedBoard: string[] = ["_", "_", "_", "_"];
  
  // 1. Populate the board with previously revealed positions
  for (const idx of input.previouslyRevealed) {
    if (idx >= 0 && idx < 4) {
      revealedBoard[idx] = secretArr[idx];
    }
  }
  
  // 2. Evaluate the active guess index-by-index
  for (let i = 0; i < 4; i++) {
    if (guessArr[i] === secretArr[i]) {
      if (!input.previouslyRevealed.includes(i)) {
        newlyRevealed.push(i);
        revealedBoard[i] = secretArr[i];
      }
    }
  }
  
  // 3. Count total active discoveries
  const totalRevealed = [...new Set([...input.previouslyRevealed, ...newlyRevealed])];
  
  return {
    correctCount: totalRevealed.length,
    newlyRevealed,
    revealedBoard
  };
}
```

### 4.3 Comprehensive Matching Scenarios

The following execution table outlines how the matching engine evaluates complex edge cases, repeats, and index locks.

**Scenario Parameters:** Opponent Secret Key ($S$) = `"1104"`

| Guess ($G$) | Prev Revealed ($D_{prev}$) | Calculation Details | Newly Revealed ($D_{new}$) | Revealed Board ($D_{total}$) | Resulting Count ($|D_{total}|$) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `"5004"` | `[]` | $g_2 = s_2 = '0'$, $g_3 = s_3 = '0' \neq '4'$. Wait, index 3 matches: $g_3=s_3='4'$. | `[2, 3]` | `["_", "_", "0", "4"]` | **2** | Double discovery (indices 2 and 3 matched). |
| `"1224"` | `[2, 3]` | $g_0 = s_0 = '1'$ (New). $g_3 = s_3 = '4'$ (Already locked in $D_{prev}$). | `[0]` | `["1", "_", "0", "4"]` | **3** | Index 3 was already locked, so only index 0 is newly revealed. |
| `"1114"` | `[0, 2, 3]` | $g_1 = s_1 = '1'$ (New). $g_3$ already locked. | `[1]` | `["1", "1", "0", "4"]` | **4** | Index 1 matches. All 4 positions are now locked. Victory! |
| `"4444"` | `[]` | $g_3 = s_3 = '4'$. Indices 0,1,2 do not match. | `[3]` | `["_", "_", "_", "4"]` | **1** | Only index 3 matches. Although '4' appears elsewhere in the guess, it doesn't match the corresponding secret index. |

---

## 5. Turn and Rotation Rules

*   **Turn Definition:** A turn consists of one validated guess submission or one turn timer expiration event.
*   **Sequential Ordering:** Player 1 always goes first. Turn rotation is binary: Player 1 $\rightarrow$ Player 2 $\rightarrow$ Player 1.
*   **Out-of-Turn Protection:** The server maintains an internal `currentTurnSlot` variable (1 or 2). If a client associated with slot $X$ submits a guess while `currentTurnSlot` $\neq X$, the server ignores the guess and immediately returns a `NOT_YOUR_TURN` socket error.
*   **Client Guess Lockout:** While the opponent is thinking, the active player's input grid must be visually disabled (grayed out) with a clear status message (e.g., *"Waiting for Opponent..."*).

---

## 6. Authoritative Turn Timer System

The turn timer is a server-side countdown designed to prevent game-stalling and maintain high-speed engagement.

```
                     PLAYER TURN COMMENCES
                               │
                Server sets timer (e.g., 30s)
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       GUESS SUBMITTED                  TIMER EXPIRES
               │                               │
    Evaluate and advance            Server automatically
       to next player                skips player's turn
               │                               │
               └───────────────┬───────────────┘
                               ▼
                    NEXT PLAYER'S TURN STARTS
```

### 6.1 Configuration Options
During room creation, the creator chooses one of the following timer settings:
*   **No Timer** (Default for casual play)
*   **30 Seconds** (Fast-paced bullet mode)
*   **60 Seconds** (Standard match speed)
*   **90 Seconds** (Deep tactical speed)

### 6.2 Timer State Ownership
The server calculates exact timestamps. When a turn transitions, the server broadcasts a `turn_changed` event carrying a UTC timestamp field: `timerEndsAt`. The client displays a visual countdown synchronized against this timestamp, eliminating disparities caused by network latency or local machine clock offsets.

### 6.3 Automatic Timeout Action
*   When the current time exceeds `timerEndsAt`, the server **automatically skips** the active player's turn.
*   No guess evaluation occurs during a timeout skip.
*   The server increments the active player's timeout counter, toggles `currentTurnSlot` to the opponent, resets the countdown, and issues a new `turn_changed` packet.

### 6.4 Stall Prevention & Victory by Forfeit
To prevent deliberate griefing or repeated disconnection stalling, the server tracks **consecutive timeouts** per player.
*   If a player suffers **three (3) consecutive timeouts**, the server immediately flags a stall condition.
*   The opponent is presented with an overlay panel offering two options:
    1.  **Claim Victory Immediately:** Resolves the room in favor of the active opponent as an early victory (records the win in database stats).
    2.  **Keep Waiting:** Resets the timeout tracker and continues the match.

---

## 7. Match Victory Conditions

A match can end in one of three ways, all of which are evaluated exclusively on the server.

### 7.1 Absolute Victory
*   **Trigger:** At least one player's $D_{total}$ set reaches a length of 4 (i.e., all 4 digits of the opponent's secret key are successfully guessed and locked).
*   **Resolution:** The game is immediately marked `FINISHED` in the database.
*   **Payload Delivery:** The server reveals both players' original secret keys to both clients on the final victory screen, alongside match metadata (total turns, duration).

### 7.2 Sudden Match Forfeit (Grace Window Expiry)
*   **Trigger:** A player disconnects from the socket server, and fails to reconnect within the **120-second reconnection window**.
*   **Resolution:** The game state is updated to `ABANDONED`.
*   **Stats Allocation:** No wins are awarded to either player, and the match is excluded from the total `gamesPlayed` count in `BattleStats` (preventing stats padding or unfair losses caused by true connection failures).

### 7.3 Early Victory Option (Consecutive Timeout Claim)
*   **Trigger:** A player accumulates 3 consecutive timeouts, and the opponent chooses the "Claim Victory" option.
*   **Resolution:** Marked as `FINISHED` with the opponent as the winner.

---

## 8. Symmetrical Game Edge Cases

Below is the definitive handling manual for system edge cases.

### 8.1 Symmetrical Double Victory (Simultaneous Discovery)
Because turns alternate, Player 1 may guess the final digit on turn $N$, and Player 2 may have been on the verge of guessing on turn $N$.
*   **Rule:** There are **no ties**. Symmetrical double victory is mathematically impossible in a standard sequential turn-based environment because the game resolves immediately the moment *one* player locks all 4 digits. If Player 1 submits the final digit, the server immediately marks the game as `FINISHED`. Player 2's pending turn is never executed.
*   **Design Note:** This rewards Player 1's slight tactical speed advantage of going first, while keeping the game resolution clean.

### 8.2 Blind Turn Skipping
If a player's timer runs out, the opponent gets their turn without having to dodge a guess. This is handled exactly like a standard turn swap, but the client shows a noticeable visual badge: *"Opponent Timed Out — Your Turn!"*.

---

## 9. Document References

*   *Database structures for storage:* [03_DATABASE_SCHEMA.md](03_DATABASE_SCHEMA.md)
*   *Socket data payloads for turn_changed and guess_result:* [04_SOCKET_EVENTS.md](04_SOCKET_EVENTS.md)
*   *UI layout of the game board & guessing history:* [05_UI_SPEC.md](05_UI_SPEC.md)
