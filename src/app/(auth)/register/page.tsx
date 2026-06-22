"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import AuthLayout from "@/components/layout/auth-layout";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

export default function RegisterPage() {
  const { user, registerWithEmail, loginWithGoogle } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/verify-2fa");
  }, [user, router]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      show("Le mot de passe doit contenir au moins 8 caractères", "error");
      return;
    }
    setLoading(true);
    try {
      await registerWithEmail(name, email, password);
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

  return (
    <AuthLayout>
      <Logo size="md" />
      <h1 className="text-2xl font-medium text-ink-900 mt-8">Créer votre compte</h1>
      <p className="text-ink-600 text-sm mt-2">Commencez à accepter des paiements en moins de 5 minutes.</p>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="mt-7 w-full h-11 rounded-lg border border-ink-200 bg-white flex items-center justify-center gap-2.5 text-sm font-medium text-ink-800 hover:bg-ink-50 transition-colors disabled:opacity-60"
      >
        {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
        Continuer avec Google
      </button>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-ink-200" />
        <span className="text-xs text-ink-500">ou avec votre email</span>
        <div className="flex-1 h-px bg-ink-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-base" htmlFor="name">Nom complet</label>
          <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Kofi Diallo" className="input-base" />
        </div>
        <div>
          <label className="label-base" htmlFor="email">Adresse email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kofi@boutique.sn" className="input-base" />
        </div>
        <div>
          <label className="label-base" htmlFor="password">Mot de passe</label>
          <div className="relative">
            <input
              id="password" type={showPassword ? "text" : "password"} required
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" className="input-base pr-10"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p className="text-xs text-ink-500 mt-1.5">Minimum 8 caractères</p>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full h-11 mt-2">
          {loading && <Loader2 size={16} className="animate-spin" />}
          Créer mon compte gratuit
        </button>
      </form>

      <p className="text-center text-sm text-ink-600 mt-6">
        Déjà inscrit ?{" "}
        <Link href="/login" className="text-brand-600 font-medium hover:text-brand-700">Se connecter</Link>
      </p>
    </AuthLayout>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.95a9 9 0 0 0 0 8.06l3-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.6 8.6 0 0 0 9 0 9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
    </svg>
  );
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code.includes("email-already-in-use")) return "Cet email est déjà utilisé.";
  if (code.includes("weak-password")) return "Mot de passe trop faible.";
  if (code.includes("popup-closed")) return "Connexion annulée.";
  return "Une erreur est survenue. Veuillez réessayer.";
}
