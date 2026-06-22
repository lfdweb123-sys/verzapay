"use client";

import { useState } from "react";
import { Loader2, Mail, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { AppUser } from "@/types";
import type { User } from "firebase/auth";

export function EmailChangeRequest({ user, appUser }: { user: User; appUser: AppUser | null }) {
  const { show } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [sending, setSending] = useState(false);

  const hasPending = Boolean(appUser?.pendingEmail);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/account/request-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la demande");
      show("Demande envoyée. Un administrateur doit la valider.", "success");
      setNewEmail("");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card-base p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <Mail size={18} className="text-brand-700" />
        <p className="font-medium text-ink-900">Adresse email</p>
      </div>

      <div>
        <label className="label-base">Email actuel</label>
        <input type="email" disabled value={user.email ?? ""} className="input-base bg-ink-50 cursor-not-allowed" />
      </div>

      {hasPending ? (
        <div className="flex items-center gap-2.5 rounded-lg bg-warning-50 border border-warning-200 px-3.5 py-3 text-sm text-warning-900">
          <Clock size={15} className="shrink-0" />
          <div>Demande en attente de validation pour : <strong>{appUser?.pendingEmail}</strong></div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label-base">Nouvelle adresse email</label>
            <input
              type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nouvelle-adresse@exemple.com" className="input-base"
            />
            <p className="text-xs text-ink-400 mt-1.5">
              Pour des raisons de sécurité, le changement d&apos;email doit être validé par un administrateur avant d&apos;être appliqué.
            </p>
          </div>
          <button type="submit" disabled={sending} className="btn-secondary text-sm">
            {sending && <Loader2 size={14} className="animate-spin" />}
            Demander le changement
          </button>
        </form>
      )}
    </div>
  );
}
