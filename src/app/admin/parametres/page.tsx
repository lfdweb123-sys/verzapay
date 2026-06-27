"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { TwoFactorSettings } from "@/components/settings/two-factor-settings";
import { DisplaySettings } from "@/components/settings/display-settings";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Loader2, User, Lock, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

// Mêmes 3 onglets que /settings côté marchand (Profil, Sécurité, Affichage),
// volontairement sans Entreprise / Clé API : ces sections n'ont pas de sens
// pour un compte admin Verzapay, qui n'opère pas une entreprise marchande.
const TABS = [
  { id: "profile", label: "Profil", icon: User },
  { id: "security", label: "Sécurité", icon: Lock },
  { id: "display", label: "Affichage", icon: Monitor },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminParametresPage() {
  const { user, appUser } = useAuth();
  const [tab, setTab] = useState<TabId>("profile");

  const [displayName, setDisplayName] = useState(appUser?.displayName ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  function notify(text: string, type: "success" | "error") {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName });
      notify("Profil mis à jour", "success");
    } catch {
      notify("Erreur lors de la sauvegarde", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-medium text-ink-900">Paramètres</h1>

      {toastMsg && (
        <div
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm",
            toastMsg.type === "success" ? "bg-success-50 text-success-900" : "bg-danger-50 text-danger-900"
          )}
        >
          {toastMsg.text}
        </div>
      )}

      {/* Onglets */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === t.id ? "border-brand-700 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"
            )}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Onglet Profil */}
      {tab === "profile" && user && (
        <div className="space-y-5 max-w-7xl">
          <div className="card-base p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <User size={18} className="text-brand-700" />
              <p className="font-medium text-ink-900">Profil administrateur</p>
            </div>
            <div className="flex items-center gap-3">
              <UserAvatar photoURL={appUser?.photoURL} name={appUser?.displayName ?? user.email ?? "A"} size={56} />
              <div>
                <p className="text-sm font-medium text-ink-900">{appUser?.displayName}</p>
                <p className="text-xs text-ink-500">{user.email}</p>
              </div>
            </div>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="label-base">Nom complet</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-base"
                />
              </div>
              <button type="submit" disabled={savingProfile} className="btn-primary">
                {savingProfile && <Loader2 size={15} className="animate-spin" />}
                Sauvegarder
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Onglet Sécurité : 2FA uniquement (pas de bloc KYC, non pertinent pour un admin) */}
      {tab === "security" && user && (
        <div className="space-y-5 max-w-7xl">
          <TwoFactorSettings user={user} appUser={appUser} />
        </div>
      )}

      {/* Onglet Affichage */}
      {tab === "display" && (
        <div className="space-y-5 max-w-7xl">
          <DisplaySettings />
        </div>
      )}
    </div>
  );
}