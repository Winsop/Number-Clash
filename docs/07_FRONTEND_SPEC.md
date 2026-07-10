# 07_FRONTEND_SPEC

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Document ID** | NC-DOC-07 |
| **Title** | Frontend Specification & React Architecture |
| **Version** | 1.0.0 |
| **Status** | Approved / Frozen for v1 |
| **Last Updated** | 2026-07-09 |
| **Author** | Senior Software Architect & Systems Designer |
| **Target Audience** | Frontend Developers, React Engineers, UI Developers |

---

## 2. Executive Summary & Purpose

### 2.1 Purpose
This document specifies the client-side architecture, state management strategies, React component hierarchies, custom hooks, and WebSocket integration patterns for **Number Clash**. This specification ensures a responsive, modular, and performant user interface, facilitating rapid development without architectural drift.

### 2.2 Client-Side Philosophy
The client is a fast, responsive rendering engine. It:
*   Maintains zero game state authority, acting only on validated server states.
*   Uses declarative UI paradigms (React 19, Vite, Tailwind CSS) to display data clearly.
*   Utilizes `motion/react` for micro-animations that enhance spatial awareness and competitive energy.

---

## 3. React Application Architecture

The frontend is structured as a Single-Page Application (SPA) powered by Vite. The layout below illustrates the core layers of the application.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React Application Shell                         │
├────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │                        Global Context Providers                    │ │
│ │    [SocketProvider]  [SessionProvider]  [ThemeProvider]            │ │
│ └──────────────────────────────────┬─────────────────────────────────┘ │
│                                    ▼                                   │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │                         Core Router State                          │ │
│ │    [HomeScreen]  [LobbyScreen]  [GameScreen]  [VictoryScreen]      │ │
│ └──────────────────────────────────┬─────────────────────────────────┘ │
│                                    ▼                                   │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │                          Component Layer                           │ │
│ │    [InputGrid]  [DefenseBoard]  [GuessHistory]  [ChatConsole]      │ │
│ └──────────────────────────────────┬─────────────────────────────────┘ │
│                                    ▼                                   │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │                            Custom Hooks                            │ │
│ │    [useSocket]  [useTimer]  [useKeyboard]  [useLocalStorage]       │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. State Management & Data Hydration

State is categorized by lifespan and accessibility:

### 4.1 State Categories

| State Scope | Purpose | Technology | Examples |
| :--- | :--- | :--- | :--- |
| **Global WebSocket State** | Maintains socket connections, active event listeners, and reconnect sequences. | React Context API | `socket`, `connected`, `lastMessage` |
| **Session State** | Tracks identity, active room codes, and authentication tokens. | React Context + LocalStorage | `playerId`, `sessionToken`, `username` |
| **Screen State** | Coordinates which top-level interface screen is currently visible. | React Local State (`useState`) | `activeScreen` |
| **Component-Level Input State** | Buffers active, unsubmitted character inputs before transmission. | React Local State (`useState`) | `digits: string[]` |

### 4.2 Symmetrical Sync Strategy (Server to Client Hydration)
The client does not maintain an independent record of the game state. When events (such as `guess_result` or `turn_changed`) are received, they are applied directly to the local React state, replacing the previous state. This ensures complete alignment with the authoritative server.

---

## 5. Custom React Hooks

Custom hooks encapsulate complex behaviors to keep components clean and maintainable.

### 5.1 `useSocket` (Connection & Lifecycle Manager)
Manages the lifecycle of a Socket.IO client instance, providing stable listeners and handling cleanups.

```typescript
import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

export function useSocket(serverUrl: string) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // 1. Initialize authoritative socket instance
    const socket = io(serverUrl, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // 2. Perform cleanups on dismount
    return () => {
      socket.disconnect();
    };
  }, [serverUrl]);

  return {
    socket: socketRef.current,
    connected,
  };
}
```

### 5.2 `useTimer` (Visual Countdown Synchronizer)
Synchronizes the client-side countdown timer with the server's UTC timestamp.

```typescript
import { useState, useEffect } from "react";

export function useTimer(targetEndTimeIso: string | null, onTimeout?: () => void) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!targetEndTimeIso) {
      setTimeLeft(null);
      return;
    }

    const targetTime = new Date(targetEndTimeIso).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((targetTime - now) / 1000));

      setTimeLeft(diff);

      if (diff === 0) {
        clearInterval(interval);
        if (onTimeout) onTimeout();
      }
    }, 200); // Check frequently to prevent visual lag

    return () => clearInterval(interval);
  }, [targetEndTimeIso, onTimeout]);

  return timeLeft;
}
```

---

## 6. Component Hierarchy & Layout Tree

The visual architecture is broken down into structured, reusable elements:

```
[App]
 ├── [SocketProvider]
 │    └── [SessionProvider]
 │         └── [LayoutWrapper]
 │              ├── [HomeScreen] (Conditionally Renders)
 │              │    ├── [UsernameInput]
 │              │    └── [ActionButtons]
 │              ├── [LobbyScreen] (Conditionally Renders)
 │              │    ├── [RoomCodeDisplay]
 │              │    └── [CopyButton]
 │              ├── [GameScreen] (Conditionally Renders)
 │              │    ├── [MatchHeader]
 │              │    │    └── [TimerCountdown]
 │              │    ├── [DefenseBoard] (Opponent's state)
 │              │    ├── [InputGrid] (Active guess entry)
 │              │    ├── [GuessHistoryTable]
 │              │    └── [ChatSidebar]
 │              └── [VictoryScreen] (Conditionally Renders)
 │                   ├── [WinnerBadge]
 │                   └── [RematchControlPanel]
 └── [ErrorBoundary] (Global Error Catcher)
```

### 6.1 Component Responsibilities

*   **`InputGrid`:** Renders four numeric input cells. Manages auto-advance, auto-retreat focus, backspace intercepts, and submit dispatching.
*   **`DefenseBoard`:** Displays four high-visibility cells showing the opponent's secret key status. Discovered indexes display digits, while undiscovered indexes display placeholders.
*   **`GuessHistoryTable`:** Displays past guesses, results, and newly revealed indices.
*   **`ChatSidebar`:** Displays incoming chat messages, a text input field, and filters out profanity.

---

## 7. Socket Integration & Message Handlers

The client hooks into socket events and updates the UI state accordingly:

```typescript
import React, { createContext, useContext, useEffect, useState } from "react";
import { Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, connected: false });

export const SocketProvider: React.FC<{ children: React.ReactNode; url: string }> = ({ children, url }) => {
  const { socket, connected } = useSocket(url);

  useEffect(() => {
    if (!socket) return;

    // Set up global listeners
    socket.on("error", (payload: { code: string; message: string }) => {
      console.error(`[SOCKET ERROR] ${payload.code}: ${payload.message}`);
      // Dispatch alert or toast notification here
    });

    return () => {
      socket.off("error");
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = () => useContext(SocketContext);
```

---

## 8. Screen Routing & Transition Management

To prevent HMR connection flickering and keep the implementation simple, Number Clash v1 avoids complex routing packages (such as `react-router-dom`) in favor of an **Enforced State Router** managed within the root `App.tsx` context.

```typescript
type ScreenType = "HOME" | "SETUP" | "LOBBY" | "SECRET_ENTRY" | "GAMEPLAY" | "VICTORY";

export function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("HOME");
  
  return (
    <main className="w-full min-h-screen bg-[#090d16] text-gray-100 flex flex-col justify-between">
      {currentScreen === "HOME" && <HomeScreen onNavigate={setCurrentScreen} />}
      {currentScreen === "SETUP" && <RoomSetupScreen onNavigate={setCurrentScreen} />}
      {currentScreen === "LOBBY" && <LobbyScreen onNavigate={setCurrentScreen} />}
      {currentScreen === "SECRET_ENTRY" && <SecretEntryScreen onNavigate={setCurrentScreen} />}
      {currentScreen === "GAMEPLAY" && <GameplayScreen onNavigate={setCurrentScreen} />}
      {currentScreen === "VICTORY" && <VictoryScreen onNavigate={setCurrentScreen} />}
    </main>
  );
}
```

---

## 9. Error Boundary Specification

A React `ErrorBoundary` handles runtime client-side exceptions without crashing the entire app.

```typescript
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[CRITICAL FRONTEND FAULT]", error, errorInfo);
  }

  public handleRestart = () => {
    window.localStorage.clear();
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-screen bg-[#090d16] flex flex-col justify-center items-center p-6 text-center">
          <div className="bg-[#111827] border border-red-500/20 p-8 rounded-lg max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-red-500 mb-4 font-sans tracking-tight">Arena Distorted</h2>
            <p className="text-gray-300 text-sm mb-6">
              A critical visual fault has occurred. Your local session has been saved, but the interface needs to be reset.
            </p>
            <button
              id="btn-error-reset"
              onClick={this.handleRestart}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-md transition"
            >
              Reset Session
            </button>
          </div>
        </div>
      );
    }

    return this.children;
  }
}
```

---

## 10. Document References

*   *Gameplay rules & algorithmic calculations:* [01_GAME_RULES.md](01_GAME_RULES.md)
*   *Systems topology & backend architecture:* [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md)
*   *Unified Sockets communications specification:* [04_SOCKET_EVENTS.md](04_SOCKET_EVENTS.md)
*   *Physical layout structures & responsive matrices:* [05_UI_SPEC.md](05_UI_SPEC.md)
