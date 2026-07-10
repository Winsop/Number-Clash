import React, { useState, useEffect, useRef } from "react";
import { 
  Send, 
  Timer, 
  AlertTriangle, 
  CornerDownLeft, 
  MessageSquare,
  HelpCircle,
  LogOut,
  Users
} from "lucide-react";
import { 
  ActiveRoomState, 
  GameState, 
  ChatMessage, 
  GuessRecord 
} from "../types";

interface ArenaViewProps {
  roomState: ActiveRoomState;
  gameState: GameState;
  chats: ChatMessage[];
  slot: number;
  connection: {
    connected: boolean;
    isReconnecting: boolean;
    graceEndsAt: string | null;
    opponentDisconnected: boolean;
  };
  stallState: {
    isStalled: boolean;
    stalledSlot: number | null;
    message: string;
  };
  onSendChat: (text: string) => void;
  onSubmitGuess: (guess: string) => void;
  onClaimVictory: () => void;
  onKeepWaiting: () => void;
  onLeave: () => void;
}

export default function ArenaView({
  roomState,
  gameState,
  chats,
  slot,
  connection,
  stallState,
  onSendChat,
  onSubmitGuess,
  onClaimVictory,
  onKeepWaiting,
  onLeave
}: ArenaViewProps) {
  const [guessDigits, setGuessDigits] = useState<string[]>(["", "", "", ""]);
  const [chatInput, setChatInput] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unseenChats, setUnseenChats] = useState(0);

  const guessInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const isMyTurn = gameState.currentTurnSlot === slot;
  const mySlot = slot;
  const opponentSlot = slot === 1 ? 2 : 1;

  const myPlayer = roomState.players.find(p => p.slot === mySlot);
  const opponentPlayer = roomState.players.find(p => p.slot === opponentSlot);

  // Filter guess history for both sides
  const myGuesses = mySlot === 1 ? gameState.player1Guesses : gameState.player2Guesses;
  const opponentGuesses = opponentSlot === 1 ? gameState.player1Guesses : gameState.player2Guesses;

  // Filter unlocked board representations
  const myRevealedBoard = mySlot === 1 ? gameState.player1Revealed : gameState.player2Revealed;
  const opponentRevealedBoard = opponentSlot === 1 ? gameState.player1Revealed : gameState.player2Revealed;

  // Real-time Turn Timer countdown synchronizer
  useEffect(() => {
    if (!gameState.timerEndsAt) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const endTime = new Date(gameState.timerEndsAt!).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [gameState.timerEndsAt]);

  // Handle chat scroll to bottom and unseen counter
  useEffect(() => {
    if (chatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnseenChats(0);
    } else if (chats.length > 0) {
      setUnseenChats((prev) => prev + 1);
    }
  }, [chats, chatOpen]);

  // Autofocus my guess inputs on turn transition
  useEffect(() => {
    if (isMyTurn && !connection.opponentDisconnected && !stallState.isStalled) {
      guessInputsRef.current[0]?.focus();
    }
  }, [isMyTurn, connection.opponentDisconnected, stallState.isStalled]);

  // Guess digits changes
  const handleDigitChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;

    const nextDigits = [...guessDigits];
    nextDigits[index] = val.slice(-1);
    setGuessDigits(nextDigits);

    if (val && index < 3) {
      guessInputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !guessDigits[index] && index > 0) {
      const nextDigits = [...guessDigits];
      nextDigits[index - 1] = "";
      setGuessDigits(nextDigits);
      guessInputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();
    if (!/^\d{4}$/.test(pasted)) return;

    setGuessDigits(pasted.split(""));
    guessInputsRef.current[3]?.focus();
  };

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const guessStr = guessDigits.join("");
    if (guessStr.length !== 4) return;

    onSubmitGuess(guessStr);
    setGuessDigits(["", "", "", ""]);
    guessInputsRef.current[0]?.focus();
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput("");
  };

  // Disconnection Grace countdown timer
  const [reconnectSecondsLeft, setReconnectSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!connection.graceEndsAt) {
      setReconnectSecondsLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const ends = new Date(connection.graceEndsAt!).getTime();
      const diff = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setReconnectSecondsLeft(diff);

      if (diff === 0) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [connection.graceEndsAt]);

  const isFormValid = guessDigits.every(d => d !== "");

  return (
    <div id="arena-root" className="w-full max-w-5xl mx-auto flex flex-col gap-6 relative">
      {/* 1. ARENA TOP HUD BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-slate-950 border border-slate-850 rounded-lg text-xs font-mono font-semibold text-slate-400">
            TURN {gameState.turnNumber}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isMyTurn ? "bg-emerald-500 animate-ping" : "bg-slate-700"}`} />
            <h2 className="font-display text-sm font-bold text-white tracking-wide uppercase">
              {isMyTurn ? "Your Action Turn" : "Opponent Deciphering..."}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Synchronized Turn Clock */}
          {timeLeft !== null ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-bold ${
              timeLeft <= 10 
                ? "bg-rose-500/10 border-rose-500/35 text-rose-400 animate-pulse" 
                : "bg-slate-950 border-slate-850 text-indigo-400"
            }`}>
              <Timer className="w-4 h-4" />
              <span>{timeLeft}s</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-850 bg-slate-950 text-slate-500 font-mono text-xs">
              <Timer className="w-4 h-4" />
              <span>Casual</span>
            </div>
          )}

          {/* Chat toggle badge */}
          <button
            type="button"
            id="btn-toggle-chat"
            onClick={() => setChatOpen(!chatOpen)}
            className="relative p-2 rounded-xl border border-slate-850 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-750 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {unseenChats > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                {unseenChats}
              </span>
            )}
          </button>

          {/* Exit / Forfeit */}
          <button
            type="button"
            id="btn-forfeit"
            onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/15 hover:border-rose-500/30 text-rose-400 hover:text-rose-300 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-semibold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Forfeit
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT-SCREEN ARENA WORKSPACE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        
        {/* ================= LEFT ARENA: YOUR PORTAL ================= */}
        <div id="my-portal" className={`bg-slate-900 border ${isMyTurn ? "border-indigo-500/30 shadow-indigo-500/5" : "border-slate-800"} rounded-2xl p-6 flex flex-col gap-6 shadow-xl transition-all relative`}>
          {isMyTurn && (
            <div className="absolute top-4 right-4 text-[9px] font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
              Active Channel
            </div>
          )}
          
          <div className="border-b border-slate-850 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-white text-base">Your Deciphering</h3>
              <p className="text-xs text-slate-400 font-sans mt-0.5">Target Secret: {opponentPlayer?.username || "Opponent"}</p>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {myGuesses.length} Guesses Submitted
            </div>
          </div>

          {/* Discovery Portal Slots */}
          <div className="space-y-2 text-center">
            <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
              Current Locked Coordinate Progress
            </div>
            <div className="flex justify-center gap-3">
              {myRevealedBoard.map((digit, i) => (
                <div
                  id={`my-reveal-slot-${i}`}
                  key={i}
                  className={`w-14 h-16 rounded-xl flex items-center justify-center font-mono text-2xl font-bold border-2 ${
                    digit !== "_"
                      ? "bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-950 border-slate-850 text-slate-600 shadow-inner"
                  }`}
                >
                  {digit}
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Guess submissions form */}
          {isMyTurn && !connection.opponentDisconnected && !stallState.isStalled ? (
            <form onSubmit={handleGuessSubmit} className="space-y-3 bg-slate-950 border border-slate-850 rounded-2xl p-4 shadow-inner">
              <label className="block text-center text-xs font-semibold font-mono text-slate-400 uppercase tracking-wider mb-1">
                Enter Decrypted Guess
              </label>
              
              <div className="flex justify-center gap-2">
                {guessDigits.map((digit, i) => (
                  <input
                    id={`input-guess-digit-${i}`}
                    key={i}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    ref={(el) => (guessInputsRef.current[i] = el)}
                    className="w-11 h-14 bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 focus:outline-none rounded-lg text-center text-xl font-bold font-mono text-white shadow"
                    autoComplete="off"
                  />
                ))}
              </div>

              <button
                type="submit"
                id="btn-submit-guess"
                disabled={!isFormValid}
                className={`w-full py-2 rounded-lg font-mono text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  isFormValid
                    ? "bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg cursor-pointer"
                    : "bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800/50"
                }`}
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                Broadcast Guess
              </button>
            </form>
          ) : (
            <div className="bg-slate-950/40 border border-slate-850 border-dashed rounded-2xl p-6 text-center text-xs text-slate-500 font-sans flex items-center justify-center min-h-[120px]">
              {connection.opponentDisconnected ? (
                <span className="text-rose-400 font-medium">Locked due to Connection Failure</span>
              ) : stallState.isStalled ? (
                <span className="text-rose-400 font-medium">Locked due to Player Stall</span>
              ) : (
                <span className="italic flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                  Opponent's thinking cycle...
                </span>
              )}
            </div>
          )}

          {/* Local Guess Timeline logs */}
          <div className="flex-1 flex flex-col gap-2.5">
            <h4 className="text-[10px] font-mono tracking-wider text-slate-500 uppercase border-b border-slate-850 pb-1.5">
              Decryption Log Timeline
            </h4>
            
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {myGuesses.length === 0 ? (
                <p className="text-xs text-slate-600 italic font-sans py-4 text-center">No logs recorded. Launch a guess to evaluate.</p>
              ) : (
                [...myGuesses].reverse().map((g, idx) => (
                  <div key={g.id || idx} className="flex items-center justify-between py-1.5 px-3 bg-slate-950/50 border border-slate-850/50 rounded-lg text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-sans text-[10px]">#{g.turnNumber}</span>
                      <span className="font-bold text-white tracking-wider text-sm">{g.guess}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {g.newlyRevealed.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] rounded font-semibold font-sans animate-pulse">
                          +{g.newlyRevealed.length} Locked
                        </span>
                      )}
                      <span className="text-slate-400 text-[11px] font-semibold bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                        {g.correctPosition} / 4 Matches
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ================= RIGHT ARENA: OPPONENT'S PORTAL ================= */}
        <div id="opponent-portal" className="bg-slate-900 border border-slate-850 rounded-2xl p-6 flex flex-col gap-6 shadow-xl relative">
          <div className="border-b border-slate-850 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-white text-base">Opponent's Deciphering</h3>
              <p className="text-xs text-slate-400 font-sans mt-0.5">Target Secret: {myPlayer?.username || "You"}</p>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {opponentGuesses.length} Guesses Submitted
            </div>
          </div>

          {/* Opponent's Locked Progress */}
          <div className="space-y-2 text-center">
            <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
              Opponent's Locked Progress Board
            </div>
            <div className="flex justify-center gap-3">
              {opponentRevealedBoard.map((digit, i) => (
                <div
                  id={`opponent-reveal-slot-${i}`}
                  key={i}
                  className={`w-14 h-16 rounded-xl flex items-center justify-center font-mono text-2xl font-bold border-2 ${
                    digit !== "_"
                      ? "bg-rose-500/10 border-rose-500 text-rose-400 shadow-lg shadow-rose-500/10"
                      : "bg-slate-950 border-slate-850 text-slate-600 shadow-inner"
                  }`}
                >
                  {digit}
                </div>
              ))}
            </div>
          </div>

          {/* Opponent Guess Timeline logs */}
          <div className="flex-1 flex flex-col gap-2.5">
            <h4 className="text-[10px] font-mono tracking-wider text-slate-500 uppercase border-b border-slate-850 pb-1.5">
              Opponent Decryption Log Timeline
            </h4>
            
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {opponentGuesses.length === 0 ? (
                <p className="text-xs text-slate-600 italic font-sans py-4 text-center">No opponent coordinates transmitted.</p>
              ) : (
                [...opponentGuesses].reverse().map((g, idx) => (
                  <div key={g.id || idx} className="flex items-center justify-between py-1.5 px-3 bg-slate-950/30 border border-slate-850/30 rounded-lg text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-sans text-[10px]">#{g.turnNumber}</span>
                      <span className="font-bold text-slate-400 tracking-wider text-sm">{g.guess}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {g.newlyRevealed.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] rounded font-semibold font-sans">
                          +{g.newlyRevealed.length} Locked
                        </span>
                      )}
                      <span className="text-slate-500 text-[11px] font-semibold bg-slate-950/50 border border-slate-850 px-2 py-0.5 rounded">
                        {g.correctPosition} / 4 Matches
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. FLOATING SIDE-DRAWER CHAT PANEL */}
      {chatOpen && (
        <div id="chat-dock-container" className="fixed bottom-6 right-6 w-80 h-[400px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
          <div className="p-3.5 bg-slate-950 border-b border-slate-850 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-white font-display">Arena Backchannel</span>
            </div>
            <button
              type="button"
              id="btn-close-chat"
              onClick={() => setChatOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-300 font-mono"
            >
              Close
            </button>
          </div>

          {/* Messages lists */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {chats.length === 0 ? (
              <p className="text-xs text-slate-600 text-center italic mt-12">No chat traffic. Start the banter.</p>
            ) : (
              chats.map((c) => {
                const isMe = c.senderSlot === slot;
                return (
                  <div key={c.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"} space-y-1`}>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-semibold text-slate-500">
                        {c.senderName}
                      </span>
                      <span className="text-[8px] text-slate-600 font-mono">
                        {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs font-sans ${
                      isMe 
                        ? "bg-indigo-600 text-white" 
                        : "bg-slate-950 border border-slate-850 text-slate-200"
                    }`}>
                      {c.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Sending bar */}
          <form onSubmit={handleSendChat} id="chat-send-form" className="p-2.5 bg-slate-950 border-t border-slate-850 flex gap-2">
            <input
              id="input-chat"
              type="text"
              maxLength={150}
              placeholder="Signal channel..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-650 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              type="submit"
              id="btn-submit-chat"
              className="p-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg flex items-center justify-center transition-colors shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* ================= RESILIENCY ALERT OVERLAYS ================= */}

      {/* 4. OPPONENT DISCONNECTION COUNTDOWN ALERT MODAL */}
      {connection.opponentDisconnected && reconnectSecondsLeft !== null && (
        <div id="reconnect-overlay" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-rose-500/30 rounded-2xl shadow-2xl p-6 text-center space-y-5">
            <div className="inline-flex p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            
            <div className="space-y-1">
              <h3 className="font-display font-bold text-white text-lg">Challenger Signal Dropped</h3>
              <p className="text-xs text-slate-400">
                Challenger <strong className="text-rose-300">{opponentPlayer?.username || "Opponent"}</strong> disconnected from the arena.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 text-center">
              <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">
                Forfeit Warning Clock
              </div>
              <div className="text-3xl font-mono font-bold text-rose-400">
                {reconnectSecondsLeft}s
              </div>
              <p className="text-[10px] text-slate-500 mt-2 font-sans">
                The game will close and abandon if they fail to reconnect before expiration.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. TURNS STALL DETECTED OVERLAY */}
      {stallState.isStalled && (
        <div id="stall-overlay" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-indigo-500/30 rounded-2xl shadow-2xl p-6 text-center space-y-6">
            <div className="inline-flex p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div className="space-y-1">
              <h3 className="font-display font-bold text-white text-lg">Stall Detected</h3>
              <p className="text-xs text-slate-400">
                Opponent has missed 3 consecutive action cycles. Under rule NC-DOC-01, you may forfeit their session.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="btn-claim-victory"
                onClick={onClaimVictory}
                className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-500/10 transition-colors uppercase"
              >
                Claim Victory
              </button>
              <button
                type="button"
                id="btn-keep-waiting"
                onClick={onKeepWaiting}
                className="py-3 px-4 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs rounded-xl transition-colors uppercase"
              >
                Keep Waiting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Global loader spinner component used for standard transition placeholders
function Loader2({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4" 
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
      />
    </svg>
  );
}
