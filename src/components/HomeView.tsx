import React, { useState } from "react";
import { Sparkles, Timer, Play, User, HelpCircle } from "lucide-react";

interface HomeViewProps {
  onCreateRoom: (timerSec: number | null) => void;
  onJoinRoom: (roomCode: string, username: string) => void;
  error: { code: string; message: string } | null;
  onClearError: () => void;
}

export default function HomeView({ onCreateRoom, onJoinRoom, error, onClearError }: HomeViewProps) {
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("");
  const [timerPreset, setTimerPreset] = useState<number | null>(60); // Default: 60s
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [showHowTo, setShowHowTo] = useState(false);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    onJoinRoom(roomCode.toUpperCase().trim(), username.trim());
  };

  return (
    <div id="home-view-container" className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Visual Header Banner */}
      <div className="p-8 text-center bg-gradient-to-b from-slate-850 to-slate-900 border-b border-slate-800/50 relative">
        <div className="absolute top-4 right-4">
          <button 
            type="button"
            id="btn-how-to-play"
            onClick={() => setShowHowTo(!showHowTo)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="How to Play"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-xl mb-4 border border-indigo-500/20">
          <Sparkles className="w-6 h-6 text-indigo-400" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-2">
          NUMBER <span className="text-indigo-400">CLASH</span>
        </h1>
        <p className="font-mono text-xs tracking-wider text-slate-400 uppercase">
          4-Digit Authoritative Duel Arena
        </p>
      </div>

      {/* Error Display Bar */}
      {error && (
        <div id="error-banner" className="mx-6 mt-4 p-3 bg-rose-500/15 border border-rose-500/25 rounded-lg flex items-center justify-between">
          <p className="text-xs text-rose-300 font-medium">{error.message}</p>
          <button 
            id="btn-clear-error"
            onClick={onClearError} 
            className="text-xs text-rose-400 hover:text-rose-300 underline font-mono"
          >
            Clear
          </button>
        </div>
      )}

      {/* Interactive Tabs */}
      <div className="p-6">
        {showHowTo ? (
          <div id="how-to-panel" className="text-left space-y-4">
            <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider mb-2">
              Rules of Engagement
            </h3>
            <ul className="space-y-2 text-xs text-slate-300 font-sans list-disc list-inside">
              <li>Both players lock in a secret <strong className="text-indigo-400">4-digit key</strong> (e.g. <code className="font-mono bg-slate-800 px-1 rounded text-white">1224</code>). Repeated digits and leading zeros are allowed.</li>
              <li>You take turns guessing your opponent's secret key.</li>
              <li>Guesses are evaluated index-by-index: only exact matches are locked onto your revealed board.</li>
              <li>Discovering a digit locks it forever in your viewing portal (e.g., <code className="font-mono bg-slate-800 px-1 rounded text-white">_ 1 _ 4</code>).</li>
              <li>First player to discover all 4 digits wins the duel!</li>
              <li>Consecutive timeouts or disconnecting forfeit the match.</li>
            </ul>
            <button 
              id="btn-close-how-to"
              onClick={() => setShowHowTo(false)}
              className="w-full mt-4 py-2 bg-slate-800 hover:bg-slate-750 text-white text-xs font-medium rounded-lg transition-all"
            >
              Back to Terminal
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl mb-6 border border-slate-800">
              <button
                type="button"
                id="btn-tab-create"
                onClick={() => setActiveTab("create")}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "create"
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Create Arena
              </button>
              <button
                type="button"
                id="btn-tab-join"
                onClick={() => setActiveTab("join")}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "join"
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Join Arena
              </button>
            </div>

            {activeTab === "create" ? (
              <div id="create-arena-tab" className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase font-mono">
                    Turn Timer Limit
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { val: 30, label: "30s", desc: "Bullet" },
                      { val: 60, label: "60s", desc: "Speed" },
                      { val: 90, label: "90s", desc: "Tactical" },
                      { val: null, label: "None", desc: "Casual" }
                    ].map((preset) => (
                      <button
                        type="button"
                        id={`btn-preset-${preset.label.toLowerCase()}`}
                        key={preset.label}
                        onClick={() => setTimerPreset(preset.val)}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                          timerPreset === preset.val
                            ? "bg-indigo-500/10 border-indigo-500 text-indigo-400"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <span className="text-xs font-semibold font-mono">{preset.label}</span>
                        <span className="text-[9px] font-sans text-slate-500 mt-1">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-submit-create-arena"
                  onClick={() => onCreateRoom(timerPreset)}
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-650 hover:to-indigo-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/15 transition-all hover:scale-[1.01]"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Initialize Duel Arena
                </button>
              </div>
            ) : (
              <form onSubmit={handleJoin} id="join-arena-form" className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="input-username" className="block text-xs font-semibold tracking-wider text-slate-400 uppercase font-mono">
                    Your Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="input-username"
                      type="text"
                      maxLength={15}
                      placeholder="e.g. AlphaGamer"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="input-room-code" className="block text-xs font-semibold tracking-wider text-slate-400 uppercase font-mono">
                    Arena Code
                  </label>
                  <input
                    id="input-room-code"
                    type="text"
                    maxLength={6}
                    placeholder="e.g. X7Y12A"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-center text-sm font-bold tracking-widest text-white placeholder:text-slate-600 placeholder:tracking-normal focus:outline-none focus:border-indigo-500 transition-colors font-mono uppercase"
                    required
                  />
                </div>

                <button
                  type="submit"
                  id="btn-submit-join-arena"
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-650 hover:to-indigo-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/15 transition-all hover:scale-[1.01]"
                >
                  Enter Arena
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
