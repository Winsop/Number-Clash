import React, { useState } from "react";
import { Copy, Check, Users, ArrowLeft, Loader2 } from "lucide-react";
import { ActiveRoomState } from "../types";

interface LobbyViewProps {
  roomState: ActiveRoomState;
  slot: number | null;
  onLeave: () => void;
}

export default function LobbyView({ roomState, slot, onLeave }: LobbyViewProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomState.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      // fallback
    }
  };

  const inviteUrl = `${window.location.origin}/?room=${roomState.roomCode}`;

  const shareOrCopyUrl = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Number Clash Duel Arena",
          text: `Join my Number Clash duel! Code: ${roomState.roomCode}`,
          url: inviteUrl,
        });
        return;
      } catch (err) {
        // user cancelled or share failed, fallback to copy
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      // fallback
    }
  };

  return (
    <div id="lobby-view-container" className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 text-center relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

      {/* Back button */}
      <div className="absolute top-4 left-4">
        <button
          type="button"
          id="btn-lobby-back"
          onClick={onLeave}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Leave
        </button>
      </div>

      <div className="mt-6 inline-flex items-center justify-center p-3.5 bg-indigo-500/10 rounded-full mb-5 border border-indigo-500/25 relative">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-500 border border-slate-900"></span>
        </span>
      </div>

      <h2 className="font-display text-2xl font-bold text-white mb-2">
        Waiting for Opponent
      </h2>
      <p className="text-xs text-slate-400 mb-8 max-w-[280px] mx-auto leading-relaxed">
        Share the secret entrance keys below with your challenger to begin the mental clash.
      </p>

      {/* Room code display */}
      <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 mb-8 text-center shadow-inner relative group">
        <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">
          Arena Code
        </div>
        <div id="lobby-room-code" className="text-4xl font-mono font-bold tracking-widest text-white select-all">
          {roomState.roomCode}
        </div>
        <div className="flex justify-center gap-2 mt-4">
          <button
            type="button"
            id="btn-copy-code"
            onClick={copyCode}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied Code!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Code
              </>
            )}
          </button>
          <button
            type="button"
            id="btn-copy-url"
            onClick={shareOrCopyUrl}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied Link!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Share Arena Link
              </>
            )}
          </button>
        </div>
      </div>

      {/* Players grid panel */}
      <div className="bg-slate-950/50 border border-slate-850/50 rounded-xl p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-slate-850 pb-2 text-[10px] font-mono tracking-wider text-slate-500 uppercase">
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>Challengers Joined</span>
          </div>
          <div>{roomState.players.length} / 2</div>
        </div>

        <div className="space-y-2">
          {roomState.players.map((p) => (
            <div key={p.slot} className="flex items-center justify-between py-1 px-2 bg-slate-900/30 rounded-lg border border-slate-850/20">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${p.connected ? "bg-emerald-400 animate-pulse" : "bg-rose-450 animate-pulse"}`} />
                <span className="text-xs font-medium text-slate-200">
                  {p.username}
                </span>
                {p.slot === slot && (
                  <span className="text-[9px] font-mono bg-indigo-500/10 border border-indigo-500/20 px-1 text-indigo-400 rounded">
                    You
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {p.slot === 1 ? "Slot 1 (HOST)" : "Slot 2"}
              </div>
            </div>
          ))}

          {roomState.players.length < 2 && (
            <div className="flex items-center justify-between py-2 px-2 bg-slate-900/10 rounded-lg border border-dashed border-slate-800 text-left">
              <span className="text-xs text-slate-600 italic">Waiting for challenger...</span>
              <span className="w-2 h-2 rounded-full bg-slate-700" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
