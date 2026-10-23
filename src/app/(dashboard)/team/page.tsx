"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/badges";
import { UsersRound, Plus, X, Loader2, Mail, Clock, Shield, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { TeamInvite } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface MemberDisplay {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  isOwner: boolean;
}

export default function TeamPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();

  const [members, setMembers] = useState<MemberDisplay[]>([]);
  const pg = usePagination(members, 20);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"Admin" | "Membre">("Membre");
  const [sending, setSending] = useState(false);

  const isOwner = activeCompany?.ownerUid === user?.uid;

  // Charger les membres (résolution des profils via users/{uid})
  useEffect(() => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      const results: MemberDisplay[] = [];
      for (const uid of activeCompany.members) {
        const snap = await getDoc(doc(db, "users", uid));
        const data = snap.data();
        results.push({
          uid,
          email: data?.email ?? "—",
          displayName: data?.displayName ?? "Utilisateur",
          photoURL: data?.photoURL ?? null,
          isOwner: uid === activeCompany.ownerUid,
        });
      }
      results.sort((a, b) => (a.isOwner ? -1 : b.isOwner ? 1 : 0));
      setMembers(results);
      setLoading(false);
    })();
  }, [activeCompany?.id, activeCompany?.members]);

  // Charger les invitations en attente
  useEffect(() => {
    if (!activeCompany) return;
    const q = query(collection(db, "companies", activeCompany.id, "invites"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setInvites(snap.docs.map((d) => d.data() as TeamInvite).filter((i) => i.status === "pending"));
    });
  }, [activeCompany?.id]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany || !user) return;
    setSending(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompany.id, uid: user.uid, email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi");
      show("Invitation envoyée par email", "success");
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("Membre");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  async function cancelInvite(inviteId: string) {
    if (!activeCompany) return;
    try {
      await deleteDoc(doc(db, "companies", activeCompany.id, "invites", inviteId));
      show("Invitation annulée", "success");
    } catch {
      show("Erreur lors de l'annulation", "error");
    }
  }

  if (!activeCompany) {
    return (
      <div className="card-base p-8 text-center">
        <p className="text-sm text-ink-500">Créez ou sélectionnez une entreprise pour gérer son équipe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Équipe</h1>
          <p className="text-sm text-ink-500">{activeCompany.name} — Gérez les accès de votre équipe</p>
        </div>
        {isOwner && (
          <button onClick={() => setShowInvite(true)} className="btn-primary h-9 text-sm">
            <Plus size={15} /> Inviter un membre
          </button>
        )}
      </div>

      {!isOwner && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg p-3.5 text-sm text-brand-800">
          Seul le propriétaire de l&apos;entreprise peut inviter de nouveaux membres ou modifier les rôles.
        </div>
      )}

      {/* Membres actifs */}
      <div className="card-base overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100">
          <p className="text-sm font-medium text-ink-900">Membres ({members.length})</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((m) => (
              <div key={m.uid} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar photoURL={m.photoURL} name={m.displayName} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{m.displayName}</p>
                    <p className="text-xs text-ink-500 truncate">{m.email}</p>
                  </div>
                </div>
                <span className={`badge ${m.isOwner ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-700"}`}>
                  <Shield size={11} />
                  {m.isOwner ? "Propriétaire" : "Membre"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invitations en attente */}
      {invites.length > 0 && (
        <div className="card-base overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100">
            <p className="text-sm font-medium text-ink-900">Invitations en attente ({invites.length})</p>
          </div>
          <div className="divide-y divide-ink-50">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-warning-50 flex items-center justify-center shrink-0">
                    <Clock size={15} className="text-warning-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{inv.email}</p>
                    <p className="text-xs text-ink-500">Invité le {formatDate(inv.createdAt)} · Rôle : {inv.role}</p>
                  </div>
                </div>
                {isOwner && (
                  <button onClick={() => cancelInvite(inv.id)} className="text-ink-400 hover:text-danger-700 shrink-0" title="Annuler l'invitation">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && members.length === 0 && invites.length === 0 && (
        <EmptyState title="Aucun membre" description="Invitez des collaborateurs pour partager l'accès à cette entreprise." icon={UsersRound} />
      )}

      {/* Modal invitation */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-popover animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
              <p className="font-medium text-ink-900">Inviter un membre</p>
              <button onClick={() => setShowInvite(false)} className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleInvite} className="p-5 space-y-4">
              <div>
                <label className="label-base">Adresse email *</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="email" required value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="collegue@exemple.com"
                    className="input-base pl-9"
                  />
                </div>
              </div>
              <div>
                <label className="label-base">Rôle</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "Admin" | "Membre")} className="input-base">
                  <option value="Membre">Membre — accès en lecture et opérations courantes</option>
                  <option value="Admin">Administrateur — accès complet sauf gestion d&apos;équipe</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary flex-1">Annuler</button>
                <button type="submit" disabled={sending} className="btn-primary flex-1">
                  {sending && <Loader2 size={15} className="animate-spin" />}
                  Envoyer l&apos;invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}
