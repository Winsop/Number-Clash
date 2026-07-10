# Number Clash Architecture

Welcome to the central system architecture document for **Number Clash**, a real-time, competitive, multiplayer 4-digit number-guessing web game. 

This document describes the design principles, tech stack, data models, network protocols, and component design that make up the system.

---

## 1. Architectural Philosophy

Number Clash is built on three core engineering principles:

1.  **Authoritative Backend:** The server maintains sole authority over game states, timer validations, and matchmaking rules. The client is treated as an untrusted rendering layer to prevent manipulation.
2.  **Zero-Trust Event Validation:** Every socket message is authenticated against active, cryptographically secure session tokens to ensure players can only act within their assigned matches.
3.  **Connection Resilience:** The system is built to survive brief player disconnections during competitive play. If a player drops, the server holds the game state for a 120-second grace period, allowing the player to reconnect and continue.

---

## 2. Technology Stack & Directory Structure

The application is built using a modern full-stack JavaScript/TypeScript architecture:

*   **Frontend Framework:** React 19 with Vite, Tailwind CSS, and `motion/react` for micro-animations.
*   **Backend Server:** Node.js, Express, and Socket.IO for real-time bidirectional communication.
*   **Database & ORM:** PostgreSQL for durable persistence, integrated using Prisma ORM.

### Directory Structure

```
├── /docs                 # Detailed system specifications
│   ├── 01_GAME_RULES.md  # Deduction rules and turn timers
│   ├── 02_SYSTEM_ARCH.md # Network topologies and load balances
│   ├── 03_DATABASE_SCHEMA.md # Prisma schemas and indexes
│   ├── 04_SOCKET_EVENTS.md # Handshaking and socket schemas
│   ├── 05_UI_SPEC.md     # Layouts, themes, and animations
│   ├── 06_BACKEND_SPEC.md# Class architectures and rate limiters
│   ├── 07_FRONTEND_SPEC.md# State routers, contexts, and hooks
│   ├── 08_TESTING.md     # Testing suites and QA test cases
│   ├── 09_ROADMAP.md     # Milestones and quality gates
│   └── 10_BACKLOG.md     # MoSCoW backlog and feature tracking
├── ARCHITECTURE.md       # Architectural overview (this file)
├── README.md             # Developer setup and onboarding
├── metadata.json         # Platform configuration details
└── package.json          # System dependencies and run scripts
```

---

## 3. High-Level System Topology

The system components interact to deliver high-performance, real-time gameplay.

```
                    ┌────────────────────────┐
                    │      Web Browser       │
                    │ (React 19 / Tailwind)  │
                    └───────────┬────────────┘
                                │
                        HTTP    │  Socket.IO
                     Requests   │  Connection
                                ▼
                    ┌────────────────────────┐
                    │     Express Server     │
                    │ (Authoritative Engine) │
                    └───────────┬────────────┘
                                │
                          ORM / │ PostgreSQL
                        Queries │ Protocol
                                ▼
                    ┌────────────────────────┐
                    │  PostgreSQL Database   │
                    │  (Match Stats Storage) │
                    └────────────────────────┘
```

---

## 4. Subsystem Overviews

### 4.1 Authoritative Game Engine
Enforces turn integrity, evaluates numeric guess inputs index-by-index, and updates defense boards. In-progress secrets are stored securely in-memory on the backend and are only revealed to players upon match completion.

### 4.2 Room & Matchmaking Manager
Handles room code creation using cryptographically secure 6-character uppercase strings. Coordinates player slot assignments, starts games when both players are locked in, and manages lobby teardowns and cleanups.

### 4.3 Statistics & Streak Aggregator
Records match outcomes to PostgreSQL using a lexicographically sorted canonical indexing strategy (i.e., ordering player keys to prevent duplicate battle records). Maintains current win/loss streaks, longest streaks, and performance speed metrics.

---

## 5. Document Map

To explore individual subsystems in detail, consult our comprehensive documentation collection:

*   **Rules & Calculations:** [01_GAME_RULES.md](docs/01_GAME_RULES.md)
*   **Network & Topology:** [02_SYSTEM_ARCHITECTURE.md](docs/02_SYSTEM_ARCHITECTURE.md)
*   **Database Schema:** [03_DATABASE_SCHEMA.md](docs/03_DATABASE_SCHEMA.md)
*   **WebSockets Schema:** [04_SOCKET_EVENTS.md](docs/04_SOCKET_EVENTS.md)
*   **UI/UX Specification:** [05_UI_SPEC.md](docs/05_UI_SPEC.md)
*   **Backend Engineering:** [06_BACKEND_SPEC.md](docs/06_BACKEND_SPEC.md)
*   **Frontend Engineering:** [07_FRONTEND_SPEC.md](docs/07_FRONTEND_SPEC.md)
*   **Quality & Testing:** [08_TESTING.md](docs/08_TESTING.md)
*   **Milestones & Roadmap:** [09_ROADMAP.md](docs/09_ROADMAP.md)
*   **Feature Backlog:** [10_BACKLOG.md](docs/10_BACKLOG.md)
