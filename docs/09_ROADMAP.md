# 09_ROADMAP

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-09 |
| **Title** | Product Roadmap & Implementation Phases |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Product Managers, Technical Leads, Stakeholders |

---

## 2. Product Vision & Milestones

**Number Clash** is designed as a fast-paced, high-engagement competitive duel. The roadmap outlines a 3-phase progression from a core local MVP to a fully featured competitive platform.

```
┌────────────────────────────────────────────────────────┐
│                    PRODUCT ROADMAP                     │
├────────────────────────────────────────────────────────┤
│  PHASE 1 (MVP)   ──► Authoritative Core & Socket Sync  │
│  PHASE 2 (Beta)  ──► Streaks, Stats, & Reconnections   │
│  PHASE 3 (Launch)──► Global Matchmaking & Tournaments   │
└────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Phases

---

### 3.1 Phase 1: Minimum Viable Product (MVP)
*Focus: Authoritative backend validation, basic matchmaking, and direct-code room lobbies.*

*   **Milestone 1.1: Core Matching Algorithm**
    *   Implement authoritative position-only guess checking on the server.
    *   Write comprehensive test suites for repeated digits and index boundaries.
*   **Milestone 1.2: Socket.IO Server & Lobby Room Manager**
    *   Build room creation, joining, and player slot assignment.
    *   Implement room state tracking in memory.
*   **Milestone 1.3: Responsive Single-Screen Gameplay Frontend**
    *   Design the dark-slate theme and Space Grotesk display headings.
    *   Build the 4-digit input grid with auto-advance and auto-retreat focus.
    *   Add real-time guess logs and game state synchronizations.

---

### 3.2 Phase 2: Playability & Engagement (Beta)
*Focus: Competitive features, analytics, and connection resilience.*

*   **Milestone 2.1: Head-to-Head Statistics & Streak Tracking**
    *   Integrate database stats recording using Prisma/PostgreSQL.
    *   Implement head-to-head streak trackers and leaderboard calculations.
*   **Milestone 2.2: Reconnection Engine & Grace Periods**
    *   Implement the 120-second server grace period for disconnected sockets.
    *   Design the frontend connection-lost warning banner and countdown.
    *   Build automated client-side state hydration on successful re-sync.
*   **Milestone 2.3: Turn Countdowns & Match Customization**
    *   Implement backend turn countdowns (`30s`, `60s`, `90s`) using synchronized server-side timers.
    *   Build turn expiration handlers that transition active turns to the opponent when time runs out.

---

### 3.3 Phase 3: Launch & Growth (v1.0.0)
*Focus: Scalability, community features, and polishing.*

*   **Milestone 3.1: Global Matchmaking Queue (Quick Match)**
    *   Design a server-side matchmaking queue pairing active players automatically without requiring custom room codes.
*   **Milestone 3.2: Chat System**
    *   Add a persistent gameplay chat sidebar with a 150-character limit and a profanity filter.
*   **Milestone 3.3: Interactive Visuals**
    *   Add satisfying visual effects (such as confetti on victory, screen shake on invalid guesses) using `motion/react`.
    *   Support custom sound effects for clock ticks, successful submissions, and win/loss states.

---

## 4. Release Criteria & Quality Gates

Before transitioning from Beta to Launch, the application must pass these quality gates:

1.  **Linter Verification:** Clean `npm run lint` results across both client and server codebases.
2.  **Performance Baseline:** Under **100ms** latency for guess validation events at **500 concurrent rooms** (1,000 players).
3.  **Compatibility Validation:** Functional testing across major modern web browsers (Chrome, Safari, Edge, Firefox) and mobile platforms (iOS Safari, Android Chrome).
4.  **Security Audit:** Secure masking of opponent secrets and token-based event validation across all Socket.IO endpoints.

---

## 5. Document References

*   *Detailed gameplay and timer rules:* [01_GAME_RULES.md](01_GAME_RULES.md)
*   *Database schema and streak tables:* [03_DATABASE_SCHEMA.md](03_DATABASE_SCHEMA.md)
*   *Product feature prioritization:* [10_BACKLOG.md](10_BACKLOG.md)
