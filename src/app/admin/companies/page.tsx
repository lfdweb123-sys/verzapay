"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { KycBadge, Spinner, EmptyState } from "@/components/ui/badges";
import {
  Building2, Search, CheckCircle2, XCircle, Loader2, AlertTriangle,
  Ban, RotateCcw, ChevronRight, Trash2,
} from "lucide-react";
import { formatXOF, formatDate, initials, colorForName } from "@/lib/utils";
import type { Company, KycStatus } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { setNavId } from "@/lib/nav-state";

const STATUS_FILTERS: { label: string; value: KycStatus | "all" }[] = [
  { label: "Tous", value: "all" },
  { label: "En attente", value: "pending" },
  { label: "En révision", value: "review" },
  { label: "Approuvés", value: "approved" },
  { label: "Rejetés", value: "rejected" },
  { label: "Non démarré", value: "not_started" },
];

function AdminCompaniesContent() {
  const { user } = useAuth();
  const { show } = useToast();
  const searchParams = useSearchParams();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<KycStatus | "all">(
    (searchParams.get("filter") as KycStatus | "all") ?? "all"
  );
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [suspendModal, setSuspendModal] = useState<Company | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspending, setSuspending] = useState(false);
  // Sélection multiple + actions en masse
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<"suspend" | "unsuspend" | "delete" | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadCompanies() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies?uid=${user.uid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de chargement");
      setCompanies(data.companies ?? []);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function reviewKyc(companyId: string, decision: "approved" | "rejected") {
    if (!user) return;
    setReviewingId(companyId);
    try {
      const res = await fetch("/api/admin/kyc-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUid: user.uid, companyId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show(decision === "approved" ? "Entreprise approuvée" : "Entreprise rejetée", "success");
      await loadCompanies();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setReviewingId(null);
    }
  }

  async function toggleSuspend(company: Company, suspended: boolean) {
    if (!user) return;
    setSuspending(true);
    try {
      const res = await fetch("/api/admin/suspend-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUid: user.uid, companyId: company.id, suspended, reason: suspendReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show(suspended ? "Entreprise suspendue" : "Entreprise réactivée", "success");
      setSuspendModal(null);
      setSuspendReason("");
      await loadCompanies();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSuspending(false);
    }
  }

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (statusFilter !== "all" && c.kycStatus !== statusFilter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q);
    });
  }, [companies, search, statusFilter]);
  const pg = usePagination(filtered, 20, search);

  const pageAllSelected = pg.pageItems.length > 0 && pg.pageItems.every((c) => selected.has(c.id));
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pg.pageItems.forEach((c) => next.delete(c.id));
      else pg.pageItems.forEach((c) => next.add(c.id));
      return next;
    });
  }

  async function handleBulk() {
    if (!user || !bulkModal) return;
    setBulkRunning(true);
    try {
      const ids = Array.from(selected);
      let done = 0;
      const skipped: { id: string; reason: string }[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const res = await fetch("/api/admin/bulk-companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminUid: user.uid, companyIds: ids.slice(i, i + 100), action: bulkModal, reason: suspendReason || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        done += data.done;
        skipped.push(...data.skipped);
      }
      const verb = { suspend: "suspendue(s)", unsuspend: "réactivée(s)", delete: "supprimée(s)" }[bulkModal];
      show(
        `${done} entreprise(s) ${verb}${skipped.length ? ` · ${skipped.length} ignorée(s) (${Array.from(new Set(skipped.map((x) => x.reason))).join(", ")})` : ""}`,
        skipped.length && !done ? "error" : "success"
      );
      setBulkModal(null);
      setSuspendReason("");
      setSelected(new Set());
      await loadCompanies();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setBulkRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Entreprises</h1>
        <p className="text-sm text-ink-500">{companies.length} entreprise(s) sur la plateforme</p>
      </div>

      {selected.size > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50/50">
          <span className="text-sm font-medium text-ink-900">{selected.size} sélectionnée(s)</span>
          {selected.size < filtered.length && (
            <button onClick={() => setSelected(new Set(filtered.map((c) => c.id)))} className="text-sm text-brand-700 hover:underline">
              Tout sélectionner ({filtered.length})
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setBulkModal("suspend")} className="btn-secondary text-sm"><Ban size={14} /> Désactiver</button>
            <button onClick={() => setBulkModal("unsuspend")} className="btn-secondary text-sm"><RotateCcw size={14} /> Réactiver</button>
            <button onClick={() => setBulkModal("delete")} className="btn-danger text-sm"><Trash2 size={14} /> Supprimer</button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-ink-500 hover:text-ink-800">Annuler</button>
          </div>
        </div>
      )}

      <div className="card-base p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher une entreprise…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === f.value ? "bg-brand-700 text-white" : "bg-white border border-ink-200 text-ink-600 hover:bg-ink-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucune entreprise trouvée" icon={Building2} />
        ) : (
          <div className="divide-y divide-ink-50">
            <label className="flex items-center gap-2.5 px-4 py-2.5 bg-ink-50/50 text-xs text-ink-500 cursor-pointer">
              <input type="checkbox" checked={pageAllSelected} onChange={togglePage} className="rounded" />
              Sélectionner la page
            </label>
            {pg.pageItems.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3.5 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} className="rounded shrink-0" aria-label={`Sélectionner ${c.name}`} />
                <Link href="/admin/companies/detail" onClick={() => setNavId("company", c.id)} className="flex items-center gap-3 min-w-0 flex-1 group">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-sm font-semibold"
                    style={{ background: c.logoColor ?? colorForName(c.name) }}
                  >
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate group-hover:text-brand-700 transition-colors flex items-center gap-1.5">
                      {c.name}
                      {c.suspended && <span className="badge bg-danger-50 text-danger-700">Suspendue</span>}
                    </p>
                    <p className="text-xs text-ink-500">{c.country} · Créée le {formatDate(c.createdAt)} · {formatXOF(c.walletBalance ?? 0)}</p>
                  </div>
                </Link>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <KycBadge status={c.kycStatus} />
                  {(c.kycStatus === "pending" || c.kycStatus === "review") && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => reviewKyc(c.id, "approved")}
                        disabled={reviewingId === c.id}
                        className="w-8 h-8 rounded-lg bg-success-50 text-success-700 hover:bg-success-100 flex items-center justify-center transition-colors disabled:opacity-50"
                        title="Approuver"
                      >
                        {reviewingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      </button>
                      <button
                        onClick={() => reviewKyc(c.id, "rejected")}
                        disabled={reviewingId === c.id}
                        className="w-8 h-8 rounded-lg bg-danger-50 text-danger-700 hover:bg-danger-100 flex items-center justify-center transition-colors disabled:opacity-50"
                        title="Rejeter"
                      >
                        <XCircle size={15} />
                      </button>
                    </div>
                  )}
                  {c.suspended ? (
                    <button
                      onClick={() => toggleSuspend(c, false)}
                      className="w-8 h-8 rounded-lg bg-success-50 text-success-700 hover:bg-success-100 flex items-center justify-center transition-colors"
                      title="Réactiver"
                    >
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setSuspendModal(c)}
                      className="w-8 h-8 rounded-lg bg-ink-100 text-ink-600 hover:bg-danger-50 hover:text-danger-700 flex items-center justify-center transition-colors"
                      title="Suspendre"
                    >
                      <Ban size={14} />
                    </button>
                  )}
                  <Link href="/admin/companies/detail" onClick={() => setNavId("company", c.id)} className="w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center transition-colors">
                    <ChevronRight size={16} className="text-ink-400" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal d'action en masse */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-popover">
            <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-warning-700 shrink-0" />
              <p className="font-medium text-ink-900">
                {{ suspend: "Désactiver", unsuspend: "Réactiver", delete: "Supprimer définitivement" }[bulkModal]} {selected.size} entreprise(s)
              </p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-ink-600">
                {bulkModal === "delete"
                  ? "Les entreprises et toutes leurs données (transactions, décaissements, journal) seront supprimées définitivement. Action irréversible. Les entreprises avec un solde positif sont ignorées."
                  : bulkModal === "suspend"
                    ? "Les paiements et retraits seront désactivés pour ces entreprises. Aucun email n'est envoyé."
                    : "Les paiements et retraits seront réactivés. Aucun email n'est envoyé."}
              </p>
              {bulkModal === "suspend" && (
                <div>
                  <label className="label-base">Motif (interne)</label>
                  <textarea value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={2} className="input-base h-auto py-2 resize-none" />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setBulkModal(null); setSuspendReason(""); }} disabled={bulkRunning} className="btn-secondary flex-1">Annuler</button>
                <button onClick={handleBulk} disabled={bulkRunning} className={`${bulkModal === "unsuspend" ? "btn-primary" : "btn-danger"} flex-1`}>
                  {bulkRunning && <Loader2 size={14} className="animate-spin" />}
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal suspension */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-popover">
            <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-danger-700" />
              <p className="font-medium text-ink-900">Suspendre {suspendModal.name}</p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-ink-600">
                Le marchand pourra toujours se connecter et consulter son tableau de bord, mais ne pourra plus créer de paiements ni effectuer de retraits.
              </p>
              <div>
                <label className="label-base">Motif (optionnel, communiqué au marchand)</label>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={3}
                  className="input-base h-auto py-2 resize-none"
                  placeholder="Ex : Activité suspecte détectée, vérification supplémentaire requise…"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setSuspendModal(null); setSuspendReason(""); }} className="btn-secondary flex-1">Annuler</button>
                <button onClick={() => toggleSuspend(suspendModal, true)} disabled={suspending} className="btn-danger flex-1">
                  {suspending && <Loader2 size={14} className="animate-spin" />}
                  Confirmer la suspension
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}

export default function AdminCompaniesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Spinner size={28} /></div>}>
      <AdminCompaniesContent />
    </Suspense>
  );
}
