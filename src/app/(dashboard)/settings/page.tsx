"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { KycBadge } from "@/components/ui/badges";
import { TwoFactorSettings } from "@/components/settings/two-factor-settings";
import { CompanyLegalInfo } from "@/components/settings/company-legal-info";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { EmailChangeRequest } from "@/components/settings/email-change-request";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Loader2, User, Building2, ShieldCheck, Lock, Key, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const TABS = [
  { id: "profile", label: "Profil", icon: User },
  { id: "security", label: "Sécurité", icon: Lock },
  { id: "company", label: "Entreprise", icon: Building2 },
  { id: "api", label: "Clé API", icon: Key },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const { user, appUser } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const [tab, setTab] = useState<TabId>("profile");

  const [displayName, setDisplayName] = useState(appUser?.displayName ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName });
      show("Profil mis à jour", "success");
    } catch {
      show("Erreur lors de la sauvegarde", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-medium text-ink-900">Paramètres</h1>

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
        <div className="space-y-5 max-w-2xl">
          <div className="card-base p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <User size={18} className="text-brand-700" />
              <p className="font-medium text-ink-900">Profil utilisateur</p>
            </div>
            <div className="flex items-center gap-3">
              <UserAvatar photoURL={appUser?.photoURL} name={appUser?.displayName ?? user.email ?? "U"} size={56} />
              <div>
                <p className="text-sm font-medium text-ink-900">{appUser?.displayName}</p>
                <p className="text-xs text-ink-500">{user.email}</p>
              </div>
            </div>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="label-base">Nom complet</label>
                <input type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input-base" />
              </div>
              <button type="submit" disabled={savingProfile} className="btn-primary">
                {savingProfile && <Loader2 size={15} className="animate-spin" />}
                Sauvegarder
              </button>
            </form>
          </div>

          <EmailChangeRequest user={user} appUser={appUser} />
        </div>
      )}

      {/* Onglet Sécurité : 2FA + statut KYC */}
      {tab === "security" && user && (
        <div className="space-y-5 max-w-2xl">
          <TwoFactorSettings user={user} appUser={appUser} />

          {activeCompany && (
            <div className="card-base p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={18} className="text-brand-700" />
                <p className="font-medium text-ink-900">Vérification d&apos;identité (KYC)</p>
              </div>
              <div className="flex items-center justify-between bg-ink-50 rounded-lg p-4">
                <div>
                  <p className="text-sm font-medium text-ink-900">{activeCompany.name}</p>
                  <div className="mt-1.5"><KycBadge status={activeCompany.kycStatus} /></div>
                </div>
                {activeCompany.kycStatus !== "approved" && (
                  <Link
                    href={`/kyc-pending?companyId=${activeCompany.id}`}
                    className="inline-flex items-center gap-1 text-sm text-brand-600 font-medium hover:text-brand-700"
                  >
                    {activeCompany.kycStatus === "not_started" ? "Démarrer" : "Voir le statut"}
                    <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onglet Entreprise : infos générales + légales */}
      {tab === "company" && activeCompany && (
        <div className="space-y-5 max-w-2xl">
          <div className="card-base p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Building2 size={18} className="text-brand-700" />
              <p className="font-medium text-ink-900">Entreprise — {activeCompany.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-ink-500 mb-1">Statut KYC</p>
                <KycBadge status={activeCompany.kycStatus} />
              </div>
              <div>
                <p className="text-xs text-ink-500 mb-1">Commission Verzapay</p>
                <p className="font-medium">{(activeCompany.commissionRate * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 mb-1">Pays</p>
                <p className="font-medium">{activeCompany.country}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 mb-1">Secteur</p>
                <p className="font-medium">{activeCompany.sector ?? "—"}</p>
              </div>
            </div>
          </div>

          <CompanyLegalInfo company={activeCompany} />
        </div>
      )}

      {/* Onglet Clé API */}
      {tab === "api" && activeCompany && (
        <div className="max-w-2xl">
          <ApiKeyManager company={activeCompany} />
        </div>
      )}

      {!activeCompany && tab !== "profile" && tab !== "security" && (
        <div className="card-base p-8 text-center max-w-2xl">
          <p className="text-sm text-ink-500">Créez ou sélectionnez une entreprise pour accéder à cette section.</p>
        </div>
      )}
    </div>
  );
}
