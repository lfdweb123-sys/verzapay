"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, RotateCw } from "lucide-react";
import AuthLayout from "@/components/layout/auth-layout";
import { Logo } from "@/components/ui/logo";
import { useAuth, needsCodeVerification} from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

export default function Verify2FAPage() {
  const { user, appUser, loading, twoFactorVerified, setTwoFactorVerified, logout } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const hasSentInitial = useRef(false);

  const isAdmin = Boolean((appUser as { isAdmin?: boolean } | null)?.isAdmin);

  // On détermine si on a tout ce qu'il faut pour savoir si la 2FA doit
  // réellement être affichée : auth chargée, profil Firestore chargé.
  // Tant que ce n'est pas le cas, on ne rend JAMAIS le formulaire (voir
  // le render plus bas), ce qui évite le flash du formulaire 2FA avant
  // que la redirection vers /dashboard ne soit déclenchée.
  const profileReady = !loading && !!user && !!appUser;
  const twoFARequired = profileReady && needsCodeVerification(appUser, twoFactorVerified);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }

    // Si 2FA pas requise ou déjà vérifiée → redirection selon rôle
    if (appUser && !needsCodeVerification(appUser, twoFactorVerified)) {
      router.replace(isAdmin ? "/admin" : "/dashboard");
      return;
    }
    if (!hasSentInitial.current && appUser) {
      hasSentInitial.current = true;
      sendCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, appUser, twoFactorVerified]);

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
      show("Code envoyé par email", "success");
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

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(""));
      handleVerify(text);
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
      setTwoFactorVerified(true);
      show("Connexion vérifiée", "success");
      // Redirection selon rôle
      router.replace(isAdmin ? "/admin" : "/dashboard");
    } catch (err) {
      show((err as Error).message, "error");
      setDigits(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function handleCancel() {
    await logout();
    router.replace("/login");
  }

  // Tant qu'on n'a pas la certitude que la 2FA est requise (profil pas
  // encore chargé, ou 2FA non requise/déjà validée en attente de
  // redirection), on affiche un loader neutre — jamais le formulaire.
  // C'est ça qui supprime le flash du formulaire 2FA pour les comptes
  // où la 2FA n'est pas activée.
  if (!twoFARequired) {
    return (
      <AuthLayout>
        <Logo size="md" />
        <div className="mt-8 flex justify-center">
          <Loader2 size={20} className="animate-spin text-ink-400" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Logo size="md" />

      <div className="mt-8 w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
        <ShieldCheck size={22} className="text-brand-700" />
      </div>

      <h1 className="text-2xl font-medium text-ink-900 mt-4">Vérification en 2 étapes</h1>
      <p className="text-ink-600 text-sm mt-2">
        Un code à 6 chiffres a été envoyé à <strong>{user?.email}</strong>. Saisissez-le ci-dessous pour accéder à votre espace.
      </p>

      <div className="flex items-center gap-2 mt-7" onPaste={handlePaste}>
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
            className="w-11 h-12 sm:w-12 sm:h-14 text-center text-lg font-medium rounded-lg border border-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-400/30 focus:border-brand-500 disabled:opacity-50"
          />
        ))}
      </div>

      {verifying && (
        <p className="flex items-center gap-2 text-sm text-ink-500 mt-4">
          <Loader2 size={14} className="animate-spin" /> Vérification…
        </p>
      )}

      <button
        onClick={sendCode}
        disabled={sending || cooldown > 0}
        className="flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:text-brand-700 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
        {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer le code"}
      </button>

      <button onClick={handleCancel} className="text-sm text-ink-500 hover:text-ink-700 mt-3">
        Annuler et se déconnecter
      </button>
    </AuthLayout>
  );
}