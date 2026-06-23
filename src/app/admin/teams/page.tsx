"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Spinner, EmptyState } from "@/components/ui/badges";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  ShieldAlert, UserPlus, Loader2, Trash2, X, Mail,
  CheckCircle2, Crown,
} from "lucide-react";

interface AdminMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  isAdmin: boolean;
  createdAt: number;
}

export default function AdminTeamPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/team?uid=${user.uid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setMembers(data.members ?? []);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleGrantAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUid: user.uid, email: inviteEmail.trim(), action: "grant" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show("Accès administrateur accordé", "success");
      setShowInvite(false);
      setInviteEmail("");
      await load();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeAdmin(targetUid: string) {
    if (!user) return;
    setRevoking(targetUid);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUid: user.uid, targetUid, action: "revoke" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show("Accès administrateur révoqué", "success");
      await load();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Équipe Verzapay</h1>
          <p className="text-sm text-ink-500">Comptes ayant un accès administrateur à la plateforme</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
          <UserPlus size={15} /> Ajouter un admin
        </button>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : members.length === 0 ? (
          <EmptyState title="Aucun administrateur" icon={ShieldAlert} />
        ) : (
          <div className="divide-y divide-ink-50">
            {members.map((m) => (
              <div key={m.uid} className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <UserAvatar photoURL={m.photoURL} name={m.displayName} size={36} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink-900">{m.displayName}</p>
                      {m.uid === user?.uid && (
                        <span className="badge bg-brand-50 text-brand-800 flex items-center gap-1">
                          <Crown size={10} /> Vous
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 flex items-center gap-1"><Mail size={10} /> {m.email}</p>
                  </div>
                </div>
                {m.uid !== user?.uid && (
                  <button
                    onClick={() => handleRevokeAdmin(m.uid)}
                    disabled={revoking === m.uid}
                    className="w-8 h-8 rounded-lg bg-danger-50 text-danger-700 hover:bg-danger-100 flex items-center justify-center transition-colors"
                    title="Révoquer l'accès admin"
                  >
                    {revoking === m.uid ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-popover">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
              <p className="font-medium text-ink-900">Accorder l&apos;accès admin</p>
              <button onClick={() => setShowInvite(false)} className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleGrantAdmin} className="p-5 space-y-4">
              <p className="text-sm text-ink-600">
                L&apos;utilisateur doit déjà avoir un compte Verzapay. Renseignez son adresse email pour lui accorder les droits d&apos;administration.
              </p>
              <div>
                <label className="label-base">Email du compte *</label>
                <input
                  type="email" required value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="collaborateur@verzapay.com"
                  className="input-base"
                />
              </div>
              <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-xs text-warning-900">
                Les administrateurs ont accès à toutes les données de la plateforme, à la gestion des marchands et aux actions sensibles. N&apos;accordez cet accès qu&apos;à des personnes de confiance.
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary flex-1">Annuler</button>
                <button type="submit" disabled={inviting} className="btn-primary flex-1">
                  {inviting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Accorder l&apos;accès
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}