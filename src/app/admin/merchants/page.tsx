"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner, KycBadge } from "@/components/ui/badges";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  Users, Search, Ban, RotateCcw, Trash2, Loader2,
  AlertTriangle, ChevronRight, ShieldOff,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Merchant {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  createdAt: number;
  activeCompanyId: string | null;
  disabled?: boolean;
  suspended?: boolean;
}

export default function AdminMerchantsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionUid, setActionUid] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    uid: string; name: string; action: "disable" | "enable" | "delete";
  } | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/merchants-list?uid=${user.uid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setMerchants(data.merchants ?? []);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction() {
    if (!user || !confirmModal) return;
    setActionUid(confirmModal.uid);
    try {
      const res = await fetch("/api/admin/manage-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUid: user.uid,
          targetUid: confirmModal.uid,
          action: confirmModal.action,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      const labels = { 
        disable: "Marchand désactivé", 
        enable: "Marchand réactivé", 
        delete: "Compte supprimé" 
      };
      show(labels[confirmModal.action], "success");
      setConfirmModal(null);
      setReason("");
      await load();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setActionUid(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return merchants;
    return merchants.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [merchants, search]);

  // Fonction de formatage de date sécurisée
  const formatDateSafe = (timestamp: number | null | undefined): string => {
    if (!timestamp) return "Date inconnue";
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "Date invalide";
      return formatDate(date);
    } catch {
      return "Date invalide";
    }
  };

  const confirmConfig = {
    disable: {
      title: "Désactiver ce marchand",
      description: "Le marchand pourra toujours consulter son dashboard mais ne pourra plus créer de paiements ni effectuer de retraits. Il sera notifié par email.",
      btnLabel: "Confirmer la désactivation",
      btnClass: "btn-danger",
      showReason: true,
    },
    enable: {
      title: "Réactiver ce marchand",
      description: "Le marchand retrouvera l'accès complet à toutes les fonctionnalités.",
      btnLabel: "Confirmer la réactivation",
      btnClass: "btn-primary",
      showReason: false,
    },
    delete: {
      title: "Supprimer définitivement ce compte",
      description: "Cette action est irréversible. Le compte sera supprimé de Firebase Auth et toutes les données associées seront conservées dans Firestore à des fins de traçabilité.",
      btnLabel: "Supprimer définitivement",
      btnClass: "btn-danger",
      showReason: true,
    },
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Marchands</h1>
        <p className="text-sm text-ink-500">Gestion des comptes marchands de la plateforme</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Total marchands</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{merchants.length}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1">
            <Ban size={11} /> Désactivés
          </p>
          <p className="text-xl font-medium mt-1 tabular-nums text-danger-700">
            {merchants.filter((m) => m.disabled).length}
          </p>
        </div>
      </div>

      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9 h-9"
          />
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucun marchand" icon={Users} />
        ) : (
          <div className="divide-y divide-ink-50">
            {filtered.map((m) => (
              <div key={m.uid} className="flex items-center justify-between px-4 py-3.5 flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar photoURL={m.photoURL} name={m.displayName} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink-900 truncate">{m.displayName}</p>
                      {m.disabled && (
                        <span className="badge bg-danger-50 text-danger-700 flex items-center gap-1">
                          <Ban size={10} /> Désactivé
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 truncate">{m.email}</p>
                    {/* Utilisation de formatDateSafe pour éviter l'erreur */}
                    <p className="text-[11px] text-ink-400 mt-0.5">
                      Inscrit le {formatDateSafe(m.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {m.disabled ? (
                    <button
                      onClick={() => setConfirmModal({ uid: m.uid, name: m.displayName, action: "enable" })}
                      disabled={actionUid === m.uid}
                      className="w-8 h-8 rounded-lg bg-success-50 text-success-700 hover:bg-success-100 flex items-center justify-center transition-colors"
                      title="Réactiver"
                    >
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmModal({ uid: m.uid, name: m.displayName, action: "disable" })}
                      disabled={actionUid === m.uid}
                      className="w-8 h-8 rounded-lg bg-warning-50 text-warning-700 hover:bg-warning-100 flex items-center justify-center transition-colors"
                      title="Désactiver"
                    >
                      <ShieldOff size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmModal({ uid: m.uid, name: m.displayName, action: "delete" })}
                    disabled={actionUid === m.uid}
                    className="w-8 h-8 rounded-lg bg-danger-50 text-danger-700 hover:bg-danger-100 flex items-center justify-center transition-colors"
                    title="Supprimer le compte"
                  >
                    {actionUid === m.uid ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmation */}
      {confirmModal && (() => {
        const cfg = confirmConfig[confirmModal.action];
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-popover">
              <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2.5">
                <AlertTriangle size={18} className="text-warning-700 shrink-0" />
                <p className="font-medium text-ink-900">{cfg.title} — {confirmModal.name}</p>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-ink-600">{cfg.description}</p>
                {cfg.showReason && (
                  <div>
                    <label className="label-base">
                      Motif {confirmModal.action !== "delete" ? "(communiqué au marchand)" : "(interne)"}
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      className="input-base h-auto py-2 resize-none"
                      placeholder="Ex : Activité suspecte, violation des CGU…"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setConfirmModal(null); setReason(""); }} 
                    className="btn-secondary flex-1"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleAction}
                    disabled={actionUid !== null}
                    className={`${cfg.btnClass} flex-1`}
                  >
                    {actionUid && <Loader2 size={14} className="animate-spin" />}
                    {cfg.btnLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}