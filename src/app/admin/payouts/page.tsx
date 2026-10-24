"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { PayoutBadge, EmptyState, Spinner } from "@/components/ui/badges";
import { ArrowUpRight, Search, Landmark, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { formatXOF, formatDateTime } from "@/lib/utils";
import type { Payout } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

type EnrichedPayout = Payout & { companyName: string };

export default function AdminPayoutsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [payouts, setPayouts] = useState<EnrichedPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Traitement manuel des virements bancaires
  const [manualTarget, setManualTarget] = useState<{ po: EnrichedPayout; action: "complete" | "reject" } | null>(null);
  const [manualNote, setManualNote] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/payouts?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setPayouts(data.payouts ?? []);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function loadPayouts() {
    if (!user) return;
    const res = await fetch(`/api/admin/payouts?uid=${user.uid}`);
    const data = await res.json();
    if (res.ok) setPayouts(data.payouts ?? []);
  }

  async function handleManual() {
    if (!user || !manualTarget) return;
    setManualBusy(true);
    try {
      const res = await fetch("/api/admin/payout-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUid: user.uid,
          companyId: manualTarget.po.companyId,
          payoutId: manualTarget.po.id,
          action: manualTarget.action,
          note: manualNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show(manualTarget.action === "complete" ? "Virement marqué comme effectué" : "Virement rejeté — portefeuille remboursé", "success");
      setManualTarget(null);
      setManualNote("");
      await loadPayouts();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setManualBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return payouts;
    return payouts.filter(
      (p) => p.companyName?.toLowerCase().includes(q) || p.recipientName?.toLowerCase().includes(q) || p.recipientPhone?.includes(q)
    );
  }, [payouts, search]);
  const pg = usePagination(filtered, 20, search);

  const totalOut = filtered.filter((p) => p.status === "completed" || p.status === "processing").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Paiements sortants</h1>
        <p className="text-sm text-ink-500">Tous les retraits effectués par les marchands</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Total décaissé</p>
          <p className="text-xl font-medium mt-1 tabular-nums text-danger-700">{formatXOF(totalOut)}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Retraits affichés</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{filtered.length}</p>
        </div>
      </div>

      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher par entreprise, bénéficiaire…"
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
          <EmptyState title="Aucun retrait" icon={ArrowUpRight} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Marchand</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Bénéficiaire</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Statut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Montant</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {pg.pageItems.map((po) => (
                  <tr key={po.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-brand-800">{po.companyName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-ink-900">{po.recipientName ?? "—"}</p>
                      {po.method === "bank_transfer" && (po.bankSecrets ?? po.bankDetails) ? (
                        <div className="text-xs text-ink-500 space-y-0.5">
                          <p className="inline-flex items-center gap-1 text-ink-700"><Landmark size={11} /> {(po.bankSecrets ?? po.bankDetails)!.bankName} · virement manuel</p>
                          {(po.bankSecrets ?? po.bankDetails)!.iban && <p className="font-mono select-all">IBAN {(po.bankSecrets ?? po.bankDetails)!.iban}</p>}
                          {(po.bankSecrets ?? po.bankDetails)!.accountNumber && <p className="font-mono select-all">Compte {(po.bankSecrets ?? po.bankDetails)!.accountNumber}</p>}
                          {(po.bankSecrets ?? po.bankDetails)!.bicSwift && <p className="font-mono select-all">BIC {(po.bankSecrets ?? po.bankDetails)!.bicSwift}</p>}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-500">{po.recipientPhone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><PayoutBadge status={po.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{formatDateTime(po.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums text-danger-700">-{formatXOF(po.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {po.manual && po.method === "bank_transfer" && po.status === "pending" ? (
                        <div className="inline-flex gap-1.5">
                          <button onClick={() => setManualTarget({ po, action: "complete" })} className="btn-primary h-8 px-2.5 text-xs"><CheckCircle2 size={13} /> Payé</button>
                          <button onClick={() => setManualTarget({ po, action: "reject" })} className="btn-danger h-8 px-2.5 text-xs"><XCircle size={13} /> Rejeter</button>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />

      {manualTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-popover">
            <div className="px-5 py-4 border-b border-ink-100">
              <p className="font-medium text-ink-900">
                {manualTarget.action === "complete" ? "Confirmer le virement effectué" : "Rejeter le virement"}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-ink-600">
                {manualTarget.action === "complete"
                  ? `Confirmez que le virement de ${formatXOF(manualTarget.po.amount)} vers ${manualTarget.po.bankDetails?.bankName ?? "la banque"} a bien été effectué. Le marchand sera notifié.`
                  : `Le virement sera rejeté et ${formatXOF(manualTarget.po.amount)} seront remboursés sur le portefeuille de ${manualTarget.po.companyName}.`}
              </p>
              <div>
                <label className="label-base">{manualTarget.action === "complete" ? "Référence / note (optionnel)" : "Motif du rejet (envoyé au marchand)"}</label>
                <textarea value={manualNote} onChange={(e) => setManualNote(e.target.value)} rows={2} className="input-base h-auto py-2 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setManualTarget(null); setManualNote(""); }} disabled={manualBusy} className="btn-secondary flex-1">Annuler</button>
                <button onClick={handleManual} disabled={manualBusy} className={`${manualTarget.action === "complete" ? "btn-primary" : "btn-danger"} flex-1`}>
                  {manualBusy && <Loader2 size={14} className="animate-spin" />}
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
