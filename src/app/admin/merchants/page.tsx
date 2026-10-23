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
import { Pagination, usePagination } from "@/components/ui/pagination";
import { isSpamAccount } from "@/lib/spam";

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
  // Sélection multiple + actions en masse
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<"disable" | "enable" | "delete" | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

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

  const { page, setPage, pageCount, pageItems, total } = usePagination(filtered, 20, search);

  function toggleOne(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }
  const pageAllSelected = pageItems.length > 0 && pageItems.every((m) => selected.has(m.uid));
  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageItems.forEach((m) => next.delete(m.uid));
      else pageItems.forEach((m) => next.add(m.uid));
      return next;
    });
  }
  const spamUids = useMemo(
    () => merchants.filter((m) => isSpamAccount({ displayName: m.displayName, email: m.email })).map((m) => m.uid),
    [merchants]
  );
  function selectSpam() {
    setSelected(new Set(spamUids));
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((m) => m.uid)));
  }

  async function handleBulk() {
    if (!user || !bulkModal) return;
    setBulkRunning(true);
    try {
      const uids = Array.from(selected);
      let done = 0;
      const skipped: { uid: string; reason: string }[] = [];
      for (let i = 0; i < uids.length; i += 100) {
        const res = await fetch("/api/admin/bulk-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminUid: user.uid, targetUids: uids.slice(i, i + 100), action: bulkModal, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        done += data.done;
        skipped.push(...data.skipped);
      }
      const verb = { disable: "désactivé(s)", enable: "réactivé(s)", delete: "supprimé(s)" }[bulkModal];
      show(
        `${done} compte(s) ${verb}${skipped.length ? ` · ${skipped.length} ignoré(s) (${Array.from(new Set(skipped.map((x) => x.reason))).join(", ")})` : ""}`,
        skipped.length && !done ? "error" : "success"
      );
      setBulkModal(null);
      setReason("");
      setSelected(new Set());
      await load();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setBulkRunning(false);
    }
  }

  // Fonction de formatage de date sécurisée - CORRIGÉE
  const formatDateSafe = (timestamp: number | null | undefined): string => {
    if (!timestamp) return "Date inconnue";
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "Date invalide";
      // Convertir la date en timestamp pour formatDate
      return formatDate(date.getTime());
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

      {spamUids.length > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center justify-between gap-2 border-danger-200 bg-danger-50/50">
          <p className="text-sm text-ink-800">
            <strong>{spamUids.length}</strong> compte(s) détecté(s) comme spam (nom aléatoire / adresse suspecte).
          </p>
          <button onClick={selectSpam} className="btn-danger text-sm">
            <Trash2 size={14} /> Sélectionner les comptes spam
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50/50">
          <span className="text-sm font-medium text-ink-900">{selected.size} sélectionné(s)</span>
          {selected.size < filtered.length && (
            <button onClick={selectAllFiltered} className="text-sm text-brand-700 hover:underline">
              Tout sélectionner ({filtered.length})
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setBulkModal("disable")} className="btn-secondary text-sm"><ShieldOff size={14} /> Désactiver</button>
            <button onClick={() => setBulkModal("enable")} className="btn-secondary text-sm"><RotateCcw size={14} /> Réactiver</button>
            <button onClick={() => setBulkModal("delete")} className="btn-danger text-sm"><Trash2 size={14} /> Supprimer</button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-ink-500 hover:text-ink-800">Annuler</button>
          </div>
        </div>
      )}

      <div className="card-base overflow-hidden">
        {!loading && filtered.length > 0 && (
          <label className="flex items-center gap-2.5 px-4 py-2.5 border-b border-ink-100 bg-ink-50/50 text-xs text-ink-500 cursor-pointer">
            <input type="checkbox" checked={pageAllSelected} onChange={togglePage} className="rounded" />
            Sélectionner la page
          </label>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucun marchand" icon={Users} />
        ) : (
          <div className="divide-y divide-ink-50">
            {pageItems.map((m) => (
              <div key={m.uid} className="flex items-center justify-between px-4 py-3.5 flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <input type="checkbox" checked={selected.has(m.uid)} onChange={() => toggleOne(m.uid)} className="rounded shrink-0" aria-label={`Sélectionner ${m.displayName}`} />
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
      <Pagination page={page} pageCount={pageCount} total={total} onChange={setPage} />

      {/* Modal d'action en masse */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-popover">
            <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-warning-700 shrink-0" />
              <p className="font-medium text-ink-900">
                {{ disable: "Désactiver", enable: "Réactiver", delete: "Supprimer définitivement" }[bulkModal]} {selected.size} compte(s)
              </p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-ink-600">
                {bulkModal === "delete"
                  ? "Les comptes seront supprimés définitivement (connexion, profil et entreprises vides). Action irréversible. Les administrateurs, votre propre compte et les comptes avec un solde positif ou un KYC approuvé sont ignorés."
                  : bulkModal === "disable"
                    ? "Les comptes ne pourront plus se connecter et leurs entreprises seront suspendues. Aucun email n'est envoyé."
                    : "Les comptes retrouveront l'accès et leurs entreprises seront réactivées. Aucun email n'est envoyé."}
              </p>
              {bulkModal === "disable" && (
                <div>
                  <label className="label-base">Motif (interne)</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input-base h-auto py-2 resize-none" placeholder="Ex : Comptes spam" />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setBulkModal(null); setReason(""); }} disabled={bulkRunning} className="btn-secondary flex-1">Annuler</button>
                <button onClick={handleBulk} disabled={bulkRunning} className={`${bulkModal === "enable" ? "btn-primary" : "btn-danger"} flex-1`}>
                  {bulkRunning && <Loader2 size={14} className="animate-spin" />}
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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