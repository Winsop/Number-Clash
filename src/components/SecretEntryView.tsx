import React, { useState, useRef, useEffect } from "react";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";

interface SecretEntryViewProps {
  onSubmit: (secret: string) => void;
  playerSlot: number;
  opponentReady: boolean;
}

export default function SecretEntryView({ onSubmit, playerSlot, opponentReady }: SecretEntryViewProps) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [mask, setMask] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Autofocus first input on mount
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return; // Only allow digits

    const nextDigits = [...digits];
    // Take only the last character if multiple are entered
    nextDigits[index] = val.slice(-1);
    setDigits(nextDigits);

    // Auto-focus next input
    if (val && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      // Auto-focus previous input on backspace if current cell is empty
      const nextDigits = [...digits];
      nextDigits[index - 1] = "";
      setDigits(nextDigits);
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    if (!/^\d{4}$/.test(pastedData)) return;

    const splitDigits = pastedData.split("");
    setDigits(splitDigits);
    inputsRef.current[3]?.focus();
  };

  const handleLockIn = (e: React.FormEvent) => {
    e.preventDefault();
    const secret = digits.join("");
    if (secret.length !== 4) return;
    
    setSubmitted(true);
    onSubmit(secret);
  };

  const isFormValid = digits.every(d => d !== "");

  if (submitted) {
    return (
      <div id="secret-wait-panel" className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 text-center relative overflow-hidden">
        <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
        
        <div className="mt-6 inline-flex items-center justify-center p-3.5 bg-indigo-500/10 rounded-full mb-5 border border-indigo-500/25">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>

        <h2 className="font-display text-xl font-bold text-white mb-2">
          Secret Locked In
        </h2>
        <p className="text-xs text-slate-400 mb-6 font-mono tracking-wider uppercase">
          Your Core Node: <span className="text-indigo-400">{mask ? "••••" : digits.join("")}</span>
        </p>

        <div className="bg-slate-950/40 border border-slate-850/50 rounded-xl p-4 text-xs text-slate-300 font-sans text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Your Status:</span>
            <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full text-[10px] font-semibold">
              READY
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Opponent Status:</span>
            {opponentReady ? (
              <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full text-[10px] font-semibold">
                READY
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-800 text-slate-500 rounded-full text-[10px] font-semibold animate-pulse">
                DECIDING...
              </span>
            )}
          </div>
        </div>

        <p className="text-[10px] text-slate-500 mt-6 font-sans">
          The duel will automatically ignite once both channels are secure.
        </p>
      </div>
    );
  }

  return (
    <div id="secret-entry-container" className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
      <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-xl mb-4 border border-indigo-500/20">
          <Shield className="w-6 h-6 text-indigo-400" />
        </div>
        <h2 className="font-display text-2xl font-bold text-white mb-2">
          Secure Your Secret Key
        </h2>
        <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
          Select exactly 4 digits. Your opponent will attempt to decode these coordinates while you decode theirs.
        </p>
      </div>

      <form onSubmit={handleLockIn} className="space-y-6">
        <div className="relative">
          <div className="flex justify-center gap-3.5">
            {digits.map((digit, i) => (
              <input
                id={`input-secret-digit-${i}`}
                key={i}
                type={mask ? "password" : "text"}
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                ref={(el) => (inputsRef.current[i] = el)}
                className="w-14 h-16 bg-slate-950 border-2 border-slate-850 hover:border-slate-750 focus:border-indigo-500 rounded-xl text-center text-2xl font-bold font-mono text-white focus:outline-none transition-all shadow-inner"
                required
                autoComplete="new-password"
              />
            ))}
          </div>

          {/* Visibility toggle button */}
          <div className="flex justify-center mt-4">
            <button
              type="button"
              id="btn-toggle-secret-mask"
              onClick={() => setMask(!mask)}
              className="text-xs text-slate-500 hover:text-slate-300 font-mono flex items-center gap-1.5 px-3 py-1 bg-slate-950 rounded-lg border border-slate-850 transition-colors"
            >
              {mask ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Reveal Secrets
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  Mask Secrets
                </>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          id="btn-submit-lock-secret"
          disabled={!isFormValid}
          className={`w-full py-3.5 font-semibold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            isFormValid
              ? "bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-650 hover:to-indigo-700 text-white shadow-lg shadow-indigo-500/15 cursor-pointer hover:scale-[1.01]"
              : "bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed"
          }`}
        >
          Lock Secure Coordinates
        </button>
      </form>
    </div>
  );
}
