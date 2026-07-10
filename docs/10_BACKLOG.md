# 10_BACKLOG

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-10 |
| **Title** | Product Feature Backlog & Task Tracking |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Project Managers, Developers, QA Engineers |

---

## 2. Backlog Overview & Categorization

Tasks are categorized using MoSCoW prioritization to guide development and focus effort:

*   **Must Have (M):** Critical for gameplay, security, or stability.
*   **Should Have (S):** Important features that enhance competitive play or connection resilience.
*   **Could Have (C):** Non-essential enhancements that improve visual polish or player convenience.
*   **Won't Have (W):** Deferred or out-of-scope features for the initial release.

---

## 3. Active Feature Backlog

---

### 3.1 Must Have (M) — Critical Path

| Task ID | Component | Title / Description | Priority | Target Milestone | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-101** | Backend | **Core Feedback Logic:** Build authoritative, index-by-index position matches checking on the server. | Must | M1.1 | Ready |
| **TSK-102** | Backend | **Room Lifecycle Manager:** Implement room creation, joining, and player slot tracking in memory. | Must | M1.2 | Ready |
| **TSK-103** | Frontend | **Aesthetic Dark Theme UI:** Build a slate-dark UI layout using Space Grotesk and Inter fonts. | Must | M1.3 | Ready |
| **TSK-104** | Frontend | **Auto-Advancing Input Grid:** Build a 4-digit input grid with auto-focus advance and retreat. | Must | M1.3 | Ready |
| **TSK-105** | Backend | **Zero-Trust Event Validation:** Implement socket authentication middleware using cryptographically secure player tokens. | Must | M1.2 | Ready |

---

### 3.2 Should Have (S) — Key Enhancements

| Task ID | Component | Title / Description | Priority | Target Milestone | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-201** | DB / Backend | **Stats Recording & Streaks:** Implement PostgreSQL persistence to track battle stats and player streaks. | Should | M2.1 | Ready |
| **TSK-202** | Backend | **120s Reconnection Grace Period:** Maintain room states when connections drop to allow reconnection. | Should | M2.2 | Ready |
| **TSK-203** | Frontend | **Reconnection Overlays:** Design the connection-lost countdown overlay on the frontend. | Should | M2.2 | Ready |
| **TSK-204** | Backend | **Authorized Turn Timers:** Implement backend-driven clock countdowns (`30s`, `60s`, `90s`) to enforce turn limits. | Should | M2.3 | Ready |

---

### 3.3 Could Have (C) — Polish & Convenience

| Task ID | Component | Title / Description | Priority | Target Milestone | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-301** | Frontend | **Rematch System:** Implement a one-click rematch request from the Victory Screen. | Could | M2.3 | Ready |
| **TSK-302** | Frontend | **Copy-to-Clipboard Enhancements:** Add quick copy buttons and "COPIED!" alerts to room codes. | Could | M1.3 | Ready |
| **TSK-303** | Frontend | **Visual Micro-Animations:** Add spring transitions for newly discovered digits using `motion/react`. | Could | M3.3 | Ready |
| **TSK-304** | Frontend | **Battle Chat Sidebar:** Implement a compact, real-time gameplay chat with profanity filters. | Could | M3.2 | Ready |

---

### 3.4 Won't Have (W) — Future Scope

| Task ID | Component | Title / Description | Priority | Reason for Deferral | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-401** | System | **Mobile App Store Native Wrappers:** Build native wrapper containers for iOS and Android deployment. | Won't | Out of scope for web MVP. | Deferred |
| **TSK-402** | System | **Relay / Spectator Mode:** Allow third-party spectators to watch ongoing games in real time. | Won't | Adds synchronization overhead; focus is on player duels first. | Deferred |
| **TSK-403** | System | **Ranked League Placement:** Complex MMR calculations and ranked competitive leagues. | Won't | Deferring until player base matches scaling targets. | Deferred |

---

## 4. Document References

*   *Implementation timelines and milestones:* [09_ROADMAP.md](09_ROADMAP.md)
*   *Database schema and streak tables:* [03_DATABASE_SCHEMA.md](03_DATABASE_SCHEMA.md)
*   *Design assets and layout screens:* [05_UI_SPEC.md](05_UI_SPEC.md)
