
# Number Clash

Number Clash is a real-time, competitive, multiplayer 4-digit number-guessing web game. Players challenge opponents in structured, fast-paced duels where deductive reasoning, tactical thinking, and speed are key.

This project implements an authoritative game backend, a resilient connection management engine, and a dark-slate theme built in React 19.

---

## 🚀 Key Features

*   **Authoritative Backend:** The server validates guesses, coordinates turns, and keeps secrets hidden until the match is decided.
*   **Auto-Advancing Input Grid:** A smooth, auto-focusing 4-digit input layout optimized for rapid typing on desktop and mobile.
*   **Connection Resilience:** A 120-second backend grace period allows disconnected players to reconnect and restore active sessions.
*   **Head-to-Head Statistics:** PostgreSQL tracking maintains head-to-head records, win/loss percentages, and competitive streaks.
*   **Polished Dark Theme:** A slate-colored theme designed for long thinking sessions, with transitions powered by `motion/react`.

---

## 📁 System Documentation Directory

The complete architecture, design specs, and roadmaps are stored in the `/docs` directory:

1.  **[01_GAME_RULES.md](docs/01_GAME_RULES.md)** — Core deduction algorithms, feedback, and turn timers.
2.  **[02_SYSTEM_ARCHITECTURE.md](docs/02_SYSTEM_ARCHITECTURE.md)** — Network topologies, state machines, and load scaling.
3.  **[03_DATABASE_SCHEMA.md](docs/03_DATABASE_SCHEMA.md)** — Database models, head-to-head stats, and index strategies.
4.  **[04_SOCKET_EVENTS.md](docs/04_SOCKET_EVENTS.md)** — Complete Socket.IO event payloads, validations, and flows.
5.  **[05_UI_SPEC.md](docs/05_UI_SPEC.md)** — Visual design, layout specifications, and animation values.
6.  **[06_BACKEND_SPEC.md](docs/06_BACKEND_SPEC.md)** — Server class structures, zero-trust token validation, and rate limiters.
7.  **[07_FRONTEND_SPEC.md](docs/07_FRONTEND_SPEC.md)** — State routing context, custom hooks, and screen managers.
8.  **[08_TESTING.md](docs/08_TESTING.md)** — Unit test matrices, socket integration scripts, and manual QA cases.
9.  **[09_ROADMAP.md](docs/09_ROADMAP.md)** — Release milestones, launch criteria, and quality gates.
10. **[10_BACKLOG.md](docs/10_BACKLOG.md)** — MoSCoW backlog and task prioritization trackers.

*For a high-level summary of system-wide architectural decisions, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.*

---

## 🛠️ Developer Setup & Commands

### Prerequisites
*   **Node.js** (v18 or higher)
*   **PostgreSQL** (running locally or in the cloud)

### Installation
Clone the repository and install all dependencies:
```bash
npm install
```

### Environment Configuration
Create a `.env` file in the root directory and configure the environment variables:
```env
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/numberclash"
SESSION_SECRET="your-cryptographic-secret-key"
```

### Run Commands

*   **Development Server:** Runs the client and server concurrently with HMR.
    ```bash
    npm run dev
    ```
*   **Build Production:** Compiles production assets for static hosting and packs the backend.
    ```bash
    npm run build
    ```
*   **Start Production Server:** Launches the compiled Express production server.
    ```bash
    npm start
    ```
*   **Linting:** Runs the TypeScript compiler and code quality checkers.
    ```bash
    npm run lint
    ```
*   **Run Tests:** Executes unit and integration test suites.
    ```bash
    npm run test
    ```


