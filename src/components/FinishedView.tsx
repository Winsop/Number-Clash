import React from "react";
import { 
  Trophy, 
  Flame, 
  RefreshCw, 
  Home, 
  Clock, 
  TrendingUp, 
  Dices,
  ShieldAlert,
  Award
} from "lucide-react";
import { BattleStats, GameState, ActiveRoomState } from "../types";

interface FinishedViewProps {
  roomState: ActiveRoomState;
  gameState: GameState;
  battleStats: BattleStats | null;
  slot: number;
  opponentRematchRequested: boolean;
  myRematchRequested: boolean;
  onRequestRematch: () => void;
  onReturnHome: () => void;
}

export default function FinishedView({
  roomState,
  gameState,
  battleStats,
  slot,
  opponentRematchRequested,
  myRematchRequested,
  onRequestRematch,
  onReturnHome
}: FinishedViewProps) {
  const isWinner = gameState.winnerSlot === slot;
  
  const mySlot = slot;
  const opponentSlot = slot === 1 ? 2 : 1;

  const myPlayer = roomState.players.find(p => p.slot === mySlot);
  const opponentPlayer = roomState.players.find(p => p.slot === opponentSlot);

  const formatDuration = (sec: number | undefined) => {
    if (sec === undefined) return "0:00";
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Resolve player specific stats mappings
  const myWinsCount = battleStats 
    ? (battleStats.player1Key === myPlayer?.playerId ? battleStats.winsPlayer1 : battleStats.winsPlayer2) 
    : 0;

  const opponentWinsCount = battleStats 
    ? (battleStats.player1Key === opponentPlayer?.playerId ? battleStats.winsPlayer1 : battleStats.winsPlayer2) 
    : 0;

  return (
    <div id="finished-view-root" className="w-full max-w-2xl mx-auto flex flex-col gap-6 relative">
      
      {/* 1. WINNER CARD BANNER */}
      <div className={`border rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden ${
        isWinner 
          ? "bg-gradient-to-b from-indigo-500/10 to-slate-900 border-indigo-500/30 shadow-indigo-500/5" 
          : "bg-gradient-to-b from-rose-500/5 to-slate-900 border-rose-500/15"
      }`}>
        {/* Radial highlight bg */}
        <div className={`absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
          isWinner ? "bg-indigo-500/20" : "bg-rose-500/10"
        }`} />

        <div className="relative z-10 flex flex-col items-center">
          <div className={`p-4 rounded-2xl border mb-5 shadow-lg ${
            isWinner 
              ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}>
            {isWinner ? (
              <Trophy className="w-8 h-8" />
            ) : (
              <ShieldAlert className="w-8 h-8" />
            )}
          </div>

          <h2 className="font-display text-3xl font-black tracking-tight text-white mb-2 uppercase">
            {isWinner ? "Victory Achieved" : "Match Defeat"}
          </h2>
          <p className="text-xs text-slate-400 max-w-[320px] mx-auto leading-relaxed">
            {isWinner 
              ? "Your logical decryption sequence resolved successfully. All coordinates secured!" 
              : "Opponent successfully decrypted your security key ahead of your sequence."
            }
          </p>
        </div>
      </div>

      {/* 2. REVEALED SECRETS PANEL */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">
            Your Original Secret
          </div>
          <div id="reveal-my-secret" className="text-2xl font-mono font-bold text-white tracking-widest">
            {slot === 1 ? gameState.player1Secret : gameState.player2Secret}
          </div>
          <div className="text-[9px] text-indigo-400 font-sans mt-1">
            {myPlayer?.username}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">
            Opponent's Secret Key
          </div>
          <div id="reveal-opponent-secret" className="text-2xl font-mono font-bold text-indigo-400 tracking-widest">
            {slot === 1 ? gameState.player2Secret : gameState.player1Secret}
          </div>
          <div className="text-[9px] text-slate-400 font-sans mt-1">
            {opponentPlayer?.username}
          </div>
        </div>
      </div>

      {/* 3. BATTLE SUMMARY STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        
        {/* Match performance metrics */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
          <h3 className="font-display font-bold text-white text-sm border-b border-slate-850 pb-2 flex items-center gap-2">
            <Award className="w-4 h-4 text-slate-400" />
            <span>Duel Analytics</span>
          </h3>

          <div className="space-y-3.5 flex-1 flex flex-col justify-center font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-sans flex items-center gap-1.5">
                <Dices className="w-4 h-4" />
                Total Turns
              </span>
              <span className="text-white font-bold">{gameState.turnNumber} Turns</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-sans flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Match Duration
              </span>
              <span className="text-white font-bold">{formatDuration(gameState.durationSec)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-sans flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                Your Guesses
              </span>
              <span className="text-white font-bold">
                {slot === 1 ? gameState.player1Guesses.length : gameState.player2Guesses.length}
              </span>
            </div>
          </div>
        </div>

        {/* HEAD-TO-HEAD BATTLE HISTORY */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
          <h3 className="font-display font-bold text-white text-sm border-b border-slate-850 pb-2 flex items-center gap-2">
            <Flame className="w-4 h-4 text-indigo-400" />
            <span>Head-to-Head Records</span>
          </h3>

          {battleStats ? (
            <div className="space-y-3.5 flex-1 flex flex-col justify-center">
              {/* Win distribution slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>{myPlayer?.username} ({myWinsCount})</span>
                  <span>({opponentWinsCount}) {opponentPlayer?.username}</span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-850">
                  <div 
                    className="bg-indigo-500 h-full transition-all" 
                    style={{ width: `${battleStats.gamesPlayed > 0 ? (myWinsCount / battleStats.gamesPlayed) * 100 : 50}%` }}
                  />
                  <div 
                    className="bg-rose-500 h-full transition-all" 
                    style={{ width: `${battleStats.gamesPlayed > 0 ? (opponentWinsCount / battleStats.gamesPlayed) * 100 : 50}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div>
                  <div className="text-[9px] text-slate-500 font-sans uppercase">Total Duels</div>
                  <div className="text-white font-bold mt-0.5">{battleStats.gamesPlayed}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 font-sans uppercase">Current Streak</div>
                  <div className="text-indigo-400 font-bold mt-0.5 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    <span>{battleStats.currentStreakOf === myPlayer?.playerId ? `${battleStats.currentStreak} Wins` : "0"}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-6 text-center font-sans">Compiling battle statistics...</p>
          )}
        </div>
      </div>

      {/* 4. ACTIONS FOOTER CONTROLS */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Rematch trigger */}
        <button
          type="button"
          id="btn-trigger-rematch"
          onClick={onRequestRematch}
          disabled={myRematchRequested}
          className={`flex-1 py-3.5 font-semibold text-xs uppercase tracking-wider rounded-xl border flex items-center justify-center gap-2 transition-all ${
            myRematchRequested
              ? "bg-slate-850 text-slate-500 border-slate-800 cursor-not-allowed"
              : "bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/10 hover:scale-[1.01]"
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${myRematchRequested ? "animate-spin text-slate-600" : ""}`} />
          {myRematchRequested 
            ? "Waiting for Opponent..." 
            : opponentRematchRequested 
              ? "Opponent Challenges! Accept Rematch" 
              : "Challenge to Rematch"
          }
        </button>

        {/* Exit back home */}
        <button
          type="button"
          id="btn-return-home"
          onClick={onReturnHome}
          className="px-6 py-3.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-slate-300 font-semibold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Home className="w-4 h-4" />
          Leave Lobby
        </button>
      </div>
    </div>
  );
}
