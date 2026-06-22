"use client";

import { Clock } from "lucide-react";

interface InactivityWarningModalProps {
  open: boolean;
  secondsLeft: number;
  onContinue: () => void;
}

export function InactivityWarningModal({ open, secondsLeft, onContinue }: InactivityWarningModalProps) {
  if (!open) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-popover p-6 text-center animate-slide-up">
        <div className="w-12 h-12 rounded-full bg-warning-50 flex items-center justify-center mx-auto">
          <Clock size={22} className="text-warning-700" />
        </div>
        <p className="font-medium text-ink-900 mt-4">Toujours là ?</p>
        <p className="text-sm text-ink-500 mt-1.5">Vous allez être déconnecté(e) par inactivité dans</p>
        <p className="text-3xl font-medium text-ink-900 tabular-nums mt-3">{display}</p>
        <button onClick={onContinue} className="btn-primary w-full mt-5">
          Continuer la session
        </button>
      </div>
    </div>
  );
}
