"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/layout/auth-layout";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

export default function LoginPage() {
  const { user, loginWithEmail, loginWithGoogle, resetPassword } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode confirmation d'email
  const isEmailChange = searchParams.get("emailChange") === "1";
  const [emailChangeUid, setEmailChangeUid] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (isEmailChange && typeof window !== "undefined") {
      setEmailChangeUid(sessionStorage.getItem("emailChangeUid"));
    }
  }, [isEmailChange]);

  useEffect(() => {
    if (user && !isEmailChange) router.replace("/verify-2fa");
  }, [user, router, isEmailChange]);

  // ... (tous tes états existants email, password, etc.)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!emailChangeUid) {
      show("Session expirée. Reconnectez-vous.", "error");
      return;
    }
    setConfirmLoading(true);
    try {
      const res = await fetch("/api/auth/confirm-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: emailChangeUid, code: confirmCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      sessionStorage.removeItem("emailChangeUid");
      setConfirmed(true);
      show("Adresse email mise à jour ! Reconnectez-vous.", "success");
      setTimeout(() => router.replace("/login"), 2500);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setConfirmLoading(false);
    }
  }

  // ---------- Rendu : mode confirmation ----------
  if (isEmailChange) {
    return (
      <AuthLayout>
        <Logo size="md" />
        <div className="mt-8 text-center">
          <ShieldCheck size={40} className="text-brand-600 mx-auto mb-4" />
          <h1 className="text-xl font-medium text-ink-900">Confirmez votre nouvelle adresse</h1>
          <p className="text-sm text-ink-500 mt-2">
            Un code à 6 chiffres a été envoyé à votre <strong>nouvelle adresse email</strong>. Saisissez-le ci-dessous pour finaliser le changement.
          </p>
        </div>

        {confirmed ? (
          <p className="text-center text-sm text-success-700 mt-8 font-medium">
            ✓ Email mis à jour. Redirection…
          </p>
        ) : (
          <form onSubmit={handleConfirmCode} className="mt-8 space-y-4">
            <div>
              <label className="label-base">Code de vérification</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                required
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="input-base text-center text-xl tracking-widest font-mono"
              />
            </div>
            <button type="submit" disabled={confirmLoading || confirmCode.length !== 6} className="btn-primary w-full h-11">
              {confirmLoading && <Loader2 size={16} className="animate-spin" />}
              Confirmer
            </button>
            <p className="text-center text-xs text-ink-400">
              Code valable 15 minutes.{" "}
              <Link href="/login" className="text-brand-600 hover:text-brand-700">
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </AuthLayout>
    );
  }

  // ---------- Rendu normal (login existant) ----------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      router.push("/verify-2fa");
    } catch (err) {
      show(friendlyError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      router.push("/verify-2fa");
    } catch (err) {
      show(friendlyError(err), "error");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) { show("Entrez d'abord votre adresse email", "info"); return; }
    try {
      await resetPassword(email);
      show("Email de réinitialisation envoyé", "success");
    } catch (err) {
      show(friendlyError(err), "error");
    }
  }

  return (
    <AuthLayout>
      {/* ... ton JSX de login existant inchangé ... */}
    </AuthLayout>
  );
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email ou mot de passe incorrect.";
  if (code.includes("too-many-requests")) return "Trop de tentatives. Réessayez plus tard.";
  if (code.includes("popup-closed")) return "Connexion annulée.";
  return "Une erreur est survenue. Veuillez réessayer.";
}