# 05_UI_SPEC

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-05 |
| **Title** | User Interface & Experience Specifications |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Frontend Developers, UI/UX Engineers, QA Analysts |

---

## 2. Visual Theme & Style Guide

Number Clash v1 implements an elegant, high-contrast, distraction-free **Slate-Dark Slate** visual theme designed to reduce eye strain during deep tactical thinking.

### 2.1 Color Palette
*   **Background (Primary):** `#090d16` (Deep Space Dark)
*   **Card Background (Secondary):** `#111827` (Charcoal Slate)
*   **Accent Color (Interactive):** `#3b82f6` (Tech Blue) / `#60a5fa` (Soft Blue)
*   **Success Indicator:** `#10b981` (Emerald Green)
*   **Error / Danger Indicator:** `#ef4444` (Vibrant Red)
*   **Warning / Notification Indicator:** `#f59e0b` (Amber Orange)
*   **Text (High Contrast):** `#f9fafb` (Off-White)
*   **Text (Muted):** `#9ca3af` (Cool Gray)

### 2.2 Typography Pairings
*   **Headings & Display Elements:** **Space Grotesk** or **Outfit** (Sans-Serif, tracking-tight, wide geometric structures for a futuristic competitive edge).
*   **Body & Controls:** **Inter** (highly readable sans-serif, optimized for numeric tracking and label sizing).
*   **Data, Inputs & Status Indicators:** **JetBrains Mono** or **Fira Code** (Monospace, ensuring identical character width to keep guess arrays perfectly aligned).

### 2.3 General Interface Layout Rules
*   **Desktop-First Precision, Mobile-First Code:** Center major panels within standard `w-full max-w-7xl mx-auto px-4` containers to prevent stretching on widescreen monitors.
*   **Touch Targets:** Every interactive element on mobile viewports must be at least **44px** in height/width.
*   **No Clutter/Anti-AI-Slop:** The interface must remain strictly functional. No unrequested system telemetry, fake container logs, ping lines, or credit footprints are permitted in page margins or headers. Keep layouts clean and humble.

---

## 3. High-Level Screen State Machine

Clients transition fluidly through specific screens driven by WebSocket connection events and user actions.

```
                      ┌────────────────────────────────────────┐
                      │             01_HOME_SCREEN             │
                      └───────┬────────────────────────┬───────┘
                              │                        │
                     Create   │                        │ Join
                     Room     ▼                        ▼
         ┌───────────────────────────┐      ┌───────────────────────────┐
         │    02_ROOM_SETUP_SCREEN   │      │    03_WAITING_LOBBY_SCREEN│
         └────────────┬──────────────┘      └──────────┬────────────────┘
                      │                                │
                      └───────────────┬────────────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │    04_SECRET_ENTRY_SCREEN │
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │      05_GAMEPLAY_SCREEN   │  ◄───┐
                        └─────────────┬─────────────┘      │ Reconnects /
                                      │                    │ Syncs
                                      ▼                    │
                        ┌───────────────────────────┐      │
                        │    06_VICTORY_SCREEN      │──────┘
                        └───────────────────────────┘
```

---

## 4. Screen-by-Screen Specifications

---

### 4.1 Screen 01: Home Screen
The landing screen must be clear, welcoming, and optimized for instant access.

```
┌────────────────────────────────────────────────────────┐
│                      NUMBER CLASH                      │
│        The Authoritative 4-Digit Duel Arena            │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │ Choose Username (Optional Guest Tag)           │   │
│   │ [ Guest#1024                                 ] │   │
│   └────────────────────────────────────────────────┘   │
│                                                        │
│        ┌──────────────────┐      ┌──────────────────┐  │
│        │   CREATE ROOM    │      │    JOIN ROOM     │  │
│        │  (Fast Setup)    │      │  (Enter Code)    │  │
│        └──────────────────┘      └──────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### Layout & Components:
*   **Hero Header:** Centered minimalist title "NUMBER CLASH" in display-weight Space Grotesk.
*   **Username Field:** A single input cell pre-populated with a random, editable guest tag (e.g. `Guest#1024`).
*   **Primary Actions Container:** A responsive two-column grid.
    *   **Button A: "Create Room":** Tech Blue background, raises `create_room` on click.
    *   **Button B: "Join Room":** Transparent boundary with white borders, triggers a bottom slide-over modal containing room code input.

#### Mobile / Responsive Behaviors:
*   On screens `< 640px`, the two-column grid stacks vertically into single-width block actions.

---

### 4.2 Screen 02: Room Setup Screen
Appears immediately after clicking "Create Room" to allow game configuration.

#### Layout & Components:
*   **Timer Configuration Selector:** A horizontal button group styled like physical switches.
    *   Options: `No Timer` (default), `30s`, `60s`, `90s`.
    *   Active selections are highlighted with Tech Blue and a subtle drop shadow. Muted grays represent inactive configurations.
*   **Primary Actions Container:**
    *   **Button: "Generate Room Code":** Dispatches configuration and transitions client.
    *   **Button: "Cancel":** Muted red border, returns player to Screen 01.

---

### 4.3 Screen 03: Waiting Lobby Screen
A transitional holding screen displaying connection details.

```
┌────────────────────────────────────────────────────────┐
│                   LOBBY CODE: NX8F92                   │
│                                                        │
│   Share this code with your opponent to begin:         │
│   ┌────────────────────────────────────────────────┐   │
│   │  NX8F92                              [ COPY ]  │   │
│   └────────────────────────────────────────────────┘   │
│                                                        │
│   Status: Waiting for opponent to join...              │
│   [██████████████░░░░░░░░░░░░░░░░░░░░] Progress       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### Layout & Components:
*   **Room Code Display:** Large, tracking-widest display of the 6-character room code in monospace JetBrains Mono.
*   **Copy Button:** Sits inside the input capsule. When clicked, copy to clipboard and replace copy text with `COPIED!` for 2 seconds.
*   **Matchmaking Progress Loader:** An animated linear strip utilizing infinite CSS gradient shifting from Slate to Soft Blue, illustrating the "Waiting for Opponent" state.

---

### 4.4 Screen 04: Secret Entry Screen
Both players have joined; secrets must be selected without risk of disclosure.

#### Layout & Components:
*   **Aesthetic Subtitle:** *"Keep it secret. Keep it safe."* displayed in light-italic font.
*   **Input Box Grid:** Four discrete square blocks (each `w-16 h-16` or `w-12 h-12` on mobile).
*   **Numeric Masking:** Character inputs must show as large dots (`•`) to prevent shoulder-surfing.
*   **Button: "Lock Key":** Emerald Green action button. Stays disabled until exactly 4 digits are populated in the input box grid. Once clicked, disable all cells and show a lock icon.

---

### 4.5 Screen 05: Active Gameplay Screen
The main interface where core gameplay occurs. Requires meticulous density management to prevent scrolling.

```
┌────────────────────────────────────────────────────────┐
│ ROOM: NX8F92  │  TURN 04  │  TIME REMAINING: 42s       │
├────────────────────────────────────────────────────────┤
│ OPPONENT'S DEFENSE BOARD                               │
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐                                │
│ │ 1 │ │ _ │ │ _ │ │ 4 │  (2 / 4 Discovered)            │
│ └───┘ └───┘ └───┘ └───┘                                │
├────────────────────────────────────────────────────────┤
│ GUESS SUBMISSION ENTRY (ACTIVE)                        │
│ [ 5 ] [ 0 ] [ 0 ] [ 4 ]  ──► [ SUBMIT GUESS ]          │
├────────────────────────────────────────────────────────┤
│ GUESS HISTORY LOG                                      │
│ Turn │ Guess │ Match Board │ New Discoveries           │
│ 03   │ 1224  │ 1 _ _ 4     │ Index 0                   │
│ 01   │ 5004  │ _ _ _ 4     │ Index 3                   │
└────────────────────────────────────────────────────────┘
```

#### Screen Section Breakdown:
1.  **Match Header Panel:** Displays current turn index, room configuration parameters, and the active visual countdown bar.
2.  **Opponent's Defense Board:** Large square blocks showing the status of the opponent's secret key. Correctly guessed indices show digits in emerald green; undiscovered cells display `_` or `?`.
3.  **Active Input Capsule:** High-density, auto-focusing numeric blocks configured with `inputMode="numeric"` to trigger native numeric keyboards on iOS and Android devices.
4.  **Guess History Log (Scrollable Table):** Shows historical match events, tracking guesses, results, and newly revealed indices.
5.  **Battle Chat Sidebar / Drawer:** Compact text pane supporting real-time chat with a 150-character limit and a profanity filter.

---

### 4.6 Screen 06: Victory Screen
Brought into view instantly upon victory, showing final results and matchmaking options.

#### Layout & Components:
*   **Hero Visual Badge:** Large text header displaying either `"VICTORY"` (Emerald Green) or `"DEFEAT"` (Vibrant Red) paired with slide-in animations.
*   **Stat Summary Grid:** Elegant, clean grid showing:
    *   Total turn duration
    *   Total guesses submitted
    *   Opponent's complete, unmasked secret key.
*   **Action Capsule:**
    *   **Button: "Rematch":** Dispatches `request_rematch` to server, transitions client to Screen 03.
    *   **Button: "Quit to Lobby":** Clears all session tokens and exits cleanly to Screen 01.

---

## 5. Input Control & Field Interactions

To ensure a seamless user experience, numeric cell entries must follow these input control rules:

```
               USER ENTERS KEY "5" IN CELL 0
                             │
                Set Cell 0 value to "5"
                             │
               Auto-advance focus to Cell 1
                             │
               USER PRESSES BACKSPACE IN CELL 1
                             │
                Clear Cell 1 value (if any)
                             │
               Auto-retreat focus to Cell 0
```

1.  **Auto-Advance:** When a user types a valid digit into numeric cell $N$, focus must automatically advance to numeric cell $N+1$.
2.  **Auto-Retreat:** When a user presses `Backspace` on an empty numeric cell, the client must automatically retreat focus to cell $N-1$ and clear its value.
3.  **Strict Masking Filter:** Inputs must intercept and block character entries other than numeric digits (`0-9`), preventing accidental text entry.

---

## 6. Connectivity & Reconnection States

### 6.1 Disconnect Banner Overlay
If the client socket disconnects, a dark, non-blocking visual overlay must immediately cover the match interface.
*   **Title:** `"Connection Distorted..."` (Amber warning color).
*   **Content:** Displays a circular countdown loader counting down from 120 seconds, representing the server's grace period.
*   **UI Lockout:** Disables all input fields to prevent input desynchronization.

### 6.2 Success Re-sync Animation
Upon successful connection recovery within the 120-second grace period, the overlay must display `"Connection Restored!"` in Emerald Green before fading out, revealing the updated match board without requiring a full browser refresh.

---

## 7. Responsive Adaptability

To maintain a consistent experience across desktop and mobile devices, the layout dynamically adjusts:

| Element | Desktop Size (W > 1024px) | Mobile Size (W < 640px) | Adaptability Solution |
| :--- | :--- | :--- | :--- |
| **Grid Layout** | Dual-Column (Gameplay left, History & Chat right) | Single-Column (Vertical scroll stack) | Tailwind Responsive Grid `grid-cols-1 lg:grid-cols-3` |
| **Input Digits** | Wide blocks (`w-16 h-16`, 2rem text) | Compact blocks (`w-12 h-12`, 1.25rem text) | Fluid spacing values via `sm:w-16 sm:h-16` |
| **Header Stats** | Spacious horizontal flex container | Centered block rows | Flex-wrap with adaptive flex values |
| **Chat Module** | Persistent sidebar on right margin | Slide-over drawer on button trigger | Hidden sidebar with mobile toggle button |

---

## 8. Micro-Animations Specification

All interface transitions use `motion` (imported from `motion/react`) to keep interactions feeling premium and fluid:

*   **Screen Transition Fade:** When navigating between screens, apply a gentle fade transition:
    *   `initial={{ opacity: 0 }}`
    *   `animate={{ opacity: 1 }}`
    *   `exit={{ opacity: 0 }}`
    *   `transition={{ duration: 0.25 }}`
*   **Newly Discovered Digits Pop:** When an index is newly revealed, the board cell must perform a brief elastic scale pop:
    *   `animate={{ scale: [1, 1.25, 1] }}`
    *   `transition={{ type: "spring", stiffness: 300, damping: 15 }}`
*   **Timer Warning Pulse:** When the countdown timer drops below 10 seconds, the digital timer container pulses red:
    *   `animate={{ scale: [1, 1.05, 1] }}`
    *   `transition={{ repeat: Infinity, duration: 1 }}`

---

## 9. Document References

*   *Authoritative feedback and timer math:* [01_GAME_RULES.md](01_GAME_RULES.md)
*   *WebSocket event payloads driving UI updates:* [04_SOCKET_EVENTS.md](04_SOCKET_EVENTS.md)
*   *Client-side React hook structures:* [07_FRONTEND_SPEC.md](07_FRONTEND_SPEC.md)
