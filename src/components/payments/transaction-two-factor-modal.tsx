"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, ShieldCheck, RotateCw, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

interface TransactionTwoFactorModalProps {
  open: boolean;
  actionLabel: string;
  onClose: () => void;
  onVerified: () => void;
}

export function TransactionTwoFactorModal({ open, actionLabel, onClose, onVerified }: TransactionTwoFactorModalProps) {
  const { user, appUser } = useAuth();
  const { show } = useToast();

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const hasSentInitial = useRef(false);

  useEffect(() => {
    if (!open) {
      hasSentInitial.current = false;
      setDigits(Array(6).fill(""));
      return;
    }
    if (!hasSentInitial.current && user) {
      hasSentInitial.current = true;
      sendCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    if (!user) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/2fa/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, email: user.email, displayName: appUser?.displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi du code");
      show("Code de sécurité envoyé par email", "success");
      setCooldown(30);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  function handleDigitChange(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    if (v && index < 5) inputsRef.current[index + 1]?.focus();
    if (next.every((d) => d !== "") && next.join("").length === 6) {
      handleVerify(next.join(""));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  async function handleVerify(code: string) {
    if (!user) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Code incorrect");
      onVerified();
    } catch (err) {
      show((err as Error).message, "error");
      setDigits(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-popover animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-brand-700" />
            <p className="font-medium text-ink-900">Vérification de sécurité</p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 text-center">
          <p className="text-sm text-ink-600">
            Confirmez ce <strong>{actionLabel}</strong> en saisissant le code à 6 chiffres envoyé à <strong>{user?.email}</strong>.
          </p>

          <div className="flex items-center justify-center gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputsRef.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                disabled={verifying}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-10 h-12 text-center text-lg font-medium rounded-lg border border-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-400/30 focus:border-brand-500 disabled:opacity-50"
              />
            ))}
          </div>

          {verifying && (
            <p className="flex items-center justify-center gap-2 text-sm text-ink-500">
              <Loader2 size={14} className="animate-spin" /> Vérification…
            </p>
          )}

          <button
            onClick={sendCode}
            disabled={sending || cooldown > 0}
            className="flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:text-brand-700 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
            {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer le code"}
          </button>
        </div>
      </div>
    </div>
  );
}
