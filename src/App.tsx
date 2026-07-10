import React, { useEffect } from "react";
import { useGameSocket } from "./useGameSocket";
import HomeView from "./components/HomeView";
import LobbyView from "./components/LobbyView";
import SecretEntryView from "./components/SecretEntryView";
import ArenaView from "./components/ArenaView";
import FinishedView from "./components/FinishedView";
import { Wifi, WifiOff } from "lucide-react";

export default function App() {
  const {
    slot,
    roomState,
    gameState,
    chats,
    battleStats,
    error,
    connection,
    stallState,
    opponentRematchRequested,
    myRematchRequested,
    createNewRoom,
    joinExistingRoom,
    submitSecret,
    submitGuess,
    claimTimeoutVictory,
    keepWaitingStall,
    requestRematch,
    sendChat,
    leaveRoom,
    clearError
  } = useGameSocket();

  // URL Auto-Lobby Detection
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room && !roomState) {
      // Auto-lobby joining/validation is fully managed inside useGameSocket connection handler.
    }
  }, [roomState]);

  // Derive opponent's ready status for the Secret Lock-in screen
  const isOpponentReadyWithSecret = () => {
    if (!roomState || !slot) return false;
    const opponentSlot = slot === 1 ? 2 : 1;
    const opponent = roomState.players.find((p) => p.slot === opponentSlot);
    return !!opponent?.secretSubmitted;
  };

  return (
    <div id="app-root" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 font-sans antialiased selection:bg-indigo-500/30 selection:text-white">
      
      {/* Mini App Header containing connection status */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between pb-4 border-b border-slate-900 mb-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/50" />
          <span className="font-display font-bold text-xs tracking-wider uppercase text-slate-400">
            Number Clash Arena
          </span>
        </div>

        {/* Real-time network health check beacon */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-850">
          {connection.connected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wide">
                Online
              </span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span className="font-mono text-[10px] text-rose-400 uppercase tracking-wide">
                Reconnecting...
              </span>
            </>
          )}
        </div>
      </header>

      {/* Primary Workspace Viewport State Machine */}
      <main className="flex-1 w-full flex items-center justify-center py-4">
        {!roomState ? (
          <HomeView
            onCreateRoom={createNewRoom}
            onJoinRoom={joinExistingRoom}
            error={error}
            onClearError={clearError}
            initialRoomCode={new URLSearchParams(window.location.search).get("room") || ""}
            initialTab={new URLSearchParams(window.location.search).get("room") ? "join" : "create"}
          />
        ) : roomState.status === "CREATED" || roomState.status === "WAITING_FOR_PLAYER" ? (
          <LobbyView 
            roomState={roomState} 
            slot={slot} 
            onLeave={leaveRoom} 
          />
        ) : roomState.status === "READY" ? (
          <SecretEntryView
            onSubmit={submitSecret}
            playerSlot={slot || 1}
            opponentReady={isOpponentReadyWithSecret()}
          />
        ) : roomState.status === "PLAYING" && gameState ? (
          <ArenaView
            roomState={roomState}
            gameState={gameState}
            chats={chats}
            slot={slot || 1}
            connection={connection}
            stallState={stallState}
            onSendChat={sendChat}
            onSubmitGuess={submitGuess}
            onClaimVictory={claimTimeoutVictory}
            onKeepWaiting={keepWaitingStall}
            onLeave={leaveRoom}
          />
        ) : (roomState.status === "GAME_FINISHED" || roomState.status === "REMATCH_PENDING") && gameState ? (
          <FinishedView
            roomState={roomState}
            gameState={gameState}
            battleStats={battleStats}
            slot={slot || 1}
            opponentRematchRequested={opponentRematchRequested}
            myRematchRequested={myRematchRequested}
            onRequestRematch={requestRematch}
            onReturnHome={leaveRoom}
          />
        ) : (
          /* Fail-safe placeholder during active game loading or syncing */
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
            <svg 
              className="animate-spin w-8 h-8 text-indigo-500" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-mono text-xs uppercase tracking-wider">Syncing Arena State...</span>
          </div>
        )}
      </main>

      {/* Simple Humble Page Footer */}
      <footer className="w-full text-center pt-8 border-t border-slate-900 mt-6">
        <p className="font-mono text-[9px] text-slate-600 tracking-wider uppercase">
          Number Clash v1.0.0 • Secure Symmetrical Cryptographic Sandbox
        </p>
      </footer>
    </div>
  );
}
