# 02_SYSTEM_ARCHITECTURE

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-02 |
| **Title** | System Architecture & Service Topology |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Devops Engineers, Systems Engineers, Full-Stack Developers |

---

## 2. Executive Summary & Purpose

### 2.1 Purpose
This document details the system topology, server authority model, lifecycle dynamics, and overall service boundaries for **Number Clash**. It serves as the primary system blueprint, guiding both deployment-phase configurations and lower-level code organization.

### 2.2 System Goal
The core objective of the Number Clash architecture is to achieve **zero-trust state synchronization** between two active client instances. This is accomplished by using a single, authoritative Node.js server that mediates all gameplay transactions, stores persistent records in a relational database, and exposes low-latency WebSocket communication.

---

## 3. High-Level Architectural Diagram

Number Clash is structured as a full-stack web application. The layout below demonstrates the physical separation of concerns and data ingestion paths.

```
       ┌────────────────────────┐                ┌────────────────────────┐
       │     Player 1 Client    │                │     Player 2 Client    │
       │   (React SPA / Vite)   │                │   (React SPA / Vite)   │
       └───────────┬────────────┘                └────────────┬───────────┘
                   │                                          │
                   │ (HTTP / WebSocket)                       │ (HTTP / WebSocket)
                   ▼                                          ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           Nginx Ingress / Proxy                        │
  │                     Exposes Port 3000 to the Public                    │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │ (Internal Routing)
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                        Authoritative Backend Server                    │
  │                          (Node.js / Express / CJS)                     │
  │                                                                        │
  │  ┌────────────────────────┐  ┌───────────────────┐  ┌───────────────┐  │
  │  │    Socket.IO Server    │  │    Turn Engine    │  │ Session Auth  │  │
  │  └────────────────────────┘  └───────────────────┘  └───────────────┘  │
  └───────────────────┬──────────────────────────────────────┬─────────────┘
                      │                                      │
                      │ (Prisma Client)                      │ (Socket.IO Adapter)
                      ▼                                      ▼
       ┌────────────────────────┐                ┌────────────────────────┐
       │   PostgreSQL Database  │                │   Redis Pub/Sub Bus    │
       │      (Cloud SQL)       │                │  (Future Scale Layer)  │
       └────────────────────────┘                └────────────────────────┘
```

---

## 4. Server Authority & State Ownership

To prevent client-side cheating (e.g., memory tampering, intercepting raw network packets, modifying active game variables), state is split into clear categories of ownership.

### 4.1 State Classification

| State Type | Description | Primary Storage Location | Examples |
| :--- | :--- | :--- | :--- |
| **Persistent State** | Permanent historical records requiring complete durability across sessions. | PostgreSQL Database | Users, Match History, BattleStats records, Room Configurations. |
| **Authoritative Runtime State** | In-flight match records actively mutated during gameplay. | Redis Cache / Server Memory | Active Room Status, Player Slots, Secret Keys, Turn Order, Disconnection timers. |
| **Transient Client State** | Ephemeral aesthetic settings and UI states that do not affect game logic. | Client Local State (React) | Local input buffer, hover indicators, theme configurations, active typing states. |

### 4.2 Security Assumption Model
The backend operates under a **Zero-Trust Client Model**:
*   Clients are assumed to be compromised or running modified code.
*   The opponent's secret key is **never** sent to a player's client under any circumstances until the victory event (`game_finished`) resolves the match.
*   Every socket message must undergo validation of identity, token, room membership, and turn matching. Invalid messages are rejected immediately.

---

## 5. Room & Socket Lifecycle Dynamics

The system maintains a highly reactive, event-driven architecture. Understanding how connections and rooms transition is critical to preventing leakages or deadlocks.

### 5.1 Room Lifecycle States
Rooms transition sequentially through well-defined phases to coordinate matchmaking and cleanups.

```
                  ┌───────────────┐
                  │    CREATED    │  ◄── Lobby initialized by Creator
                  └───────┬───────┘
                          │ Creator joins
                          ▼
               ┌─────────────────────┐
               │ WAITING_FOR_PLAYER  │  ◄── Waiting for Opponent to join
               └──────────┬──────────┘
                          │ Opponent joins
                          ▼
                  ┌───────────────┐
                  │     READY     │  ◄── Both present, entering secrets
                  └───────┬───────┘
                          │ Both secrets locked
                          ▼
                  ┌───────────────┐
                  │    PLAYING    │  ◄── Symmetrical turn rotation loop
                  └───────┬───────┘
                          │ 4 positions locked or claim victory
                          ▼
                ┌───────────────────┐
                │   GAME_FINISHED   │  ◄── Final results shown, revealing keys
                └─────────┬─────────┘
                          │ Rematch requested by one
                          ▼
               ┌─────────────────────┐
               │   REMATCH_PENDING   │  ◄── Awaiting other's rematch accept
               └──────────┬──────────┘
                          ├─────────────────────────┐
                          │ Both accept             │ One leaves or Timeout
                          ▼                         ▼
                  ┌───────────────┐         ┌───────────────┐
                  │    PLAYING    │         │    CLOSED     │  ◄── Room torn down,
                  │  (New Match)  │         └───────────────┘      TTL cleaner active
                  └───────────────┘
```

### 5.2 Dynamic Reconnection Flow (120-Second Grace Period)
When a client experiences network failure, the server must preserve the session to prevent griefing.

```mermaid
sequenceDiagram
    autonumber
    actor P1 as Player 1 Client
    participant S as Authoritative Server
    actor P2 as Player 2 Client

    P1->>S: Connected & Playing Match
    Note over P1,S: Physical network connection drops
    S->>S: Socket disconnect detected
    S->>S: Start 120s Reconnection Timer
    S->>S: Pause active Turn Timer (if configured)
    S-->>P2: Broadcast: "player_disconnected" (graceEndsAt: Timestamp)
    Note over P2: Renders countdown banner

    alt Option A: Player 1 reconnects within 120s
        P1->>S: Socket reconnect (roomId, playerId, sessionToken)
        S->>S: Verify Token matches disconnected player
        S->>S: Cancel Reconnection Timer
        S->>S: Resume Turn Timer
        S-->>P1: Emit State Restoration Payload
        S-->>P2: Broadcast: "player_reconnected"
    else Option B: Reconnection window expires
        S->>S: Reconnection Timer triggers timeout
        S->>S: Mark game as ABANDONED in DB
        S-->>P2: Broadcast: "room_closed" (reason: "OPPONENT_ABANDONED")
        S->>S: Terminate Room & Clean memory
    end
```

---

## 6. Service Boundaries & Project Directory Structure

To ensure modularity and ease of maintenance, the codebase is strictly segmented into boundaries.

### 6.1 Folder Responsibilities (Monorepo Blueprint)

The standard directory structure isolates platform-agnostic gameplay logic from specific frameworks.

```
number-clash/
├── client/                     # React Single-Page Application (SPA)
│   ├── components/             # Reusable UI widgets (Inputs, History, Banners)
│   ├── pages/                  # Top-level screen components (Home, Lobby, Game)
│   ├── hooks/                  # Custom hooks (useSocket, useTimer, useKeyboard)
│   ├── services/               # API clients and persistent storage proxies
│   └── types/                  # Local component-specific TypeScript types
├── server/                     # Autoritative Node.js Express Server
│   ├── controllers/            # REST and HTTP endpoint orchestrators
│   ├── sockets/                # Socket.IO connection and event handshakers
│   ├── services/               # Modular business logic engines (Room, Turn, Auth)
│   ├── models/                 # Database entity repositories
│   └── config/                 # DB connectors, environmental loading, and security limits
├── shared/                     # Symmetrical shared assets (Dry Principle)
│   ├── constants/              # System limits, timeout durations, and defaults
│   ├── events.ts               # Rigid socket transaction event catalogs
│   ├── types.ts                # Shared contract type definitions
│   └── validation.ts           # Shared guess/secret validation logic
├── prisma/                     # Database Schema & Migrations engine
└── docs/                       # Frozen Architectural Specifications and Manuals
```

---

## 7. Global Conventions & Standards

To ensure consistency across the backend and frontend developers, we follow these strict conventions:

### 7.1 Naming Conventions
*   **Database Columns:** `camelCase` (mapped natively within Prisma).
*   **Socket Events:** `snake_case` (defined globally in `shared/events.ts`).
*   **Files & Directories:** `snake_case` for server and shared folders; `PascalCase` for React components; `camelCase` for utilities/hooks.
*   **Environment Variables:** `SCREAMING_SNAKE_CASE` (documented in `.env.example`).

### 7.2 Logging Strategy
The server utilizes structured console logging to trace match actions without exposing sensitive secret data.
*   **FORMAT:** `[TIMESTAMP] [LEVEL] [ROOM_CODE] - MESSAGE`
*   **LEVELS:** `INFO` (Lobby created, Player joined), `WARN` (Socket disconnects, timeouts, validation errors), `ERROR` (Database connectivity drops, crash triggers).
*   **CRITICAL RULE:** *Never log players' secret keys in production output logs.*

---

## 8. Configuration & Environment Variables

All external variables must be defined inside `.env.example` as placeholders and retrieved safely within `server/config/`.

```env
# Server Runtime
NODE_ENV="development"
PORT=3000
APP_URL="https://ais-dev-br52mwrj353dbn467zge4r-108378541572.asia-east1.run.app"

# Database Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/number_clash?schema=public"

# Rate Limits (Numeric)
MAX_ROOMS_PER_MIN=5
MAX_GUESSES_PER_SEC=1
```

---

## 9. Future Scalability Architecture

While Phase 1 targets a self-contained Node.js process using local memory adapters, the systems architecture is pre-configured to scale horizontally.

```
               ┌────────────────────────────────────────────────────────┐
               │                        DNS / CDN                       │
               └───────────────────────────┬────────────────────────────┘
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                  Load Balancer (Ingress)               │
               └───────────┬────────────────────────────┬───────────────┘
                           │                            │
                           ▼                            ▼
               ┌───────────────────────┐    ┌───────────────────────┐
               │    Server Node 1      │    │    Server Node 2      │
               └───────────┬───────────┘    └───────────┬───────────┘
                           │                            │
                           ▼ (Socket.IO Redis Adapter)   ▼
               ┌────────────────────────────────────────────────────────┐
               │                   Redis Pub/Sub Bus                    │
               │        Syncs socket events across server instances     │
               └────────────────────────────────────────────────────────┘
```

1.  **Horizontal Scalability:** The server socket configuration is designed to plug into the `@socket.io/redis-adapter` with zero application-level rewrites.
2.  **Stateless Request Handoff:** Match session tokens are validated against a shared PostgreSQL instance, allowing any server node to securely handle a reconnection request.

---

## 10. Document References

*   *Detailed Gameplay logic parameters:* [01_GAME_RULES.md](01_GAME_RULES.md)
*   *Database Entity Structures:* [03_DATABASE_SCHEMA.md](03_DATABASE_SCHEMA.md)
*   *WebSocket Schema and Event Contract:* [04_SOCKET_EVENTS.md](04_SOCKET_EVENTS.md)
*   *Internal Backend Class specs:* [06_BACKEND_SPEC.md](06_BACKEND_SPEC.md)
