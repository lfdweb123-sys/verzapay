"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { ShieldCheck, Loader2 } from "lucide-react";
import type { User } from "firebase/auth";
import type { AppUser } from "@/types";

export function TwoFactorSettings({ user, appUser }: { user: User; appUser: AppUser | null }) {
  const { show } = useToast();
  const [saving, setSaving] = useState(false);
  const [savingTx, setSavingTx] = useState(false);
  const enabled = appUser?.twoFactorEnabled !== false;
  const txEnabled = appUser?.transactionTwoFactorEnabled !== false;

  async function toggle() {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { twoFactorEnabled: !enabled });
      show(!enabled ? "Authentification à deux facteurs activée" : "Authentification à deux facteurs désactivée", "success");
    } catch {
      show("Erreur lors de la mise à jour", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTx() {
    setSavingTx(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { transactionTwoFactorEnabled: !txEnabled });
      show(!txEnabled ? "Vérification activée pour les retraits et paiements" : "Vérification désactivée pour les retraits et paiements", "success");
    } catch {
      show("Erreur lors de la mise à jour", "error");
    } finally {
      setSavingTx(false);
    }
  }

  return (
    <div className="card-base p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={18} className="text-brand-700" />
        <p className="font-medium text-ink-900">Authentification à deux facteurs (2FA)</p>
      </div>

      <div className="flex items-start justify-between gap-4 bg-ink-50 rounded-lg p-4">
        <div>
          <p className="text-sm font-medium text-ink-900">Code par email à chaque connexion</p>
          <p className="text-xs text-ink-500 mt-1 leading-relaxed">
            Un code à 6 chiffres vous sera envoyé par email à chaque connexion, en plus de votre mot de passe. Recommandé pour protéger l&apos;accès à vos fonds.
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          role="switch"
          aria-checked={enabled}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-brand-700" : "bg-ink-300"}`}
        >
          {saving ? (
            <Loader2 size={12} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
          ) : (
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[22px]" : "translate-x-0.5"}`}
            />
          )}
        </button>
      </div>

      <p className="text-xs text-ink-400">
        {enabled
          ? "La 2FA est active sur votre compte. Vous devrez saisir un code reçu par email à chaque nouvelle connexion."
          : "La 2FA est désactivée. Nous recommandons de l'activer pour une sécurité optimale."}
      </p>

      <div className="flex items-start justify-between gap-4 bg-ink-50 rounded-lg p-4 border-t border-ink-100">
        <div>
          <p className="text-sm font-medium text-ink-900">Code pour les retraits et paiements</p>
          <p className="text-xs text-ink-500 mt-1 leading-relaxed">
            Un code à 6 chiffres vous sera demandé à chaque demande de retrait et chaque création de paiement, pour limiter les risques de fraude. Recommandé.
          </p>
        </div>
        <button
          onClick={toggleTx}
          disabled={savingTx}
          role="switch"
          aria-checked={txEnabled}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${txEnabled ? "bg-brand-700" : "bg-ink-300"}`}
        >
          {savingTx ? (
            <Loader2 size={12} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
          ) : (
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${txEnabled ? "translate-x-[22px]" : "translate-x-0.5"}`}
            />
          )}
        </button>
      </div>

      <p className="text-xs text-ink-400">
        {txEnabled
          ? "Chaque retrait et chaque création de paiement nécessitera une vérification par email."
          : "Les retraits et paiements ne demandent plus de vérification supplémentaire. Vous restez protégé par la 2FA de connexion si elle est active."}
      </p>
    </div>
  );
}
