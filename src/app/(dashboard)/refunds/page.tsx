"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { SimpleModal, StatusPill } from "@/components/ui/simple-modal";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { usePreferences } from "@/lib/preferences-context";

interface Refund { id: string; txId: string; amount: number; reason: string; customerName: string; status: "pending" | "completed" | "rejected"; createdAt: number; adminNote?: string | null }
interface Refundable { id: string; createdAt: number; customerName: string; amount: number; remaining: number }

const STATUS = {
  pending: { tone: "amber", label: "En traitement" },
  completed: { tone: "green", label: "Remboursé" },
  rejected: { tone: "red", label: "Refusé" },
} as const;

export default function RefundsPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { formatAmount } = usePreferences();
  const { show } = useToast();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [refundable, setRefundable] = useState<Refundable[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [txId, setTxId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const pg = usePagination(refunds, 20);

  const load = useCallback(async () => {
    if (!user || !activeCompany) return;
    try {
      const res = await fetch(`/api/refunds?uid=${user.uid}&companyId=${activeCompany.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setRefunds(data.refunds);
      setRefundable(data.refundable);
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [user, activeCompany, show]);

  useEffect(() => { load(); }, [load]);

  const selected = refundable.find((t) => t.id === txId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeCompany) return;
    setBusy(true);
    try {
      const res = await fetch("/api/refunds", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, companyId: activeCompany.id, txId, amount: Number(amount), reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show("Demande envoyée : le montant est réservé sur votre portefeuille", "success");
      setOpen(false); setTxId(""); setAmount(""); setReason("");
      await load();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium text-ink-900"><RotateCcw size={18} /> Remboursements</h1>
          <p className="text-sm text-ink-500">{activeCompany?.name} — rembourser un client sur une transaction réussie</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary h-9 text-sm whitespace-nowrap"><Plus size={15} /> Demander un remboursement</button>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16 text-ink-400"><Loader2 className="animate-spin" /></div>
        ) : refunds.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-14">Aucun remboursement pour le moment.</p>
        ) : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((r) => (
              <div key={r.id} className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{r.customerName || "Client"}</p>
                  <p className="text-xs text-ink-500">{new Date(r.createdAt).toLocaleString("fr-FR")} · {r.reason}</p>
                  {r.adminNote && <p className="text-xs text-ink-400 mt-0.5">Note : {r.adminNote}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">{formatAmount(r.amount)}</span>
                  <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />

      {open && (
        <SimpleModal
          title="Demander un remboursement" onClose={() => setOpen(false)}
          footer={<>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" form="refund-form" disabled={busy || !txId} className="btn-primary flex-1">{busy && <Loader2 size={14} className="animate-spin" />} Envoyer</button>
          </>}
        >
          <form id="refund-form" onSubmit={submit} className="space-y-4">
            <div>
              <label className="label-base">Transaction à rembourser *</label>
              <select required value={txId} onChange={(e) => { setTxId(e.target.value); const t = refundable.find((x) => x.id === e.target.value); if (t) setAmount(String(t.remaining)); }} className="input-base">
                <option value="">Choisir…</option>
                {refundable.map((t) => (
                  <option key={t.id} value={t.id}>{new Date(t.createdAt).toLocaleDateString("fr-FR")} · {t.customerName || "Client"} · {formatAmount(t.remaining)} remboursable</option>
                ))}
              </select>
              {refundable.length === 0 && <p className="text-xs text-ink-400 mt-1.5">Aucune transaction réussie remboursable.</p>}
            </div>
            <div>
              <label className="label-base">Montant à rembourser (XOF) *</label>
              <input type="number" min="1" max={selected?.remaining} required value={amount} onChange={(e) => setAmount(e.target.value)} className="input-base" />
              {selected && <p className="text-xs text-ink-400 mt-1.5">Maximum : {selected.remaining.toLocaleString("fr-FR")} XOF</p>}
            </div>
            <div>
              <label className="label-base">Motif *</label>
              <textarea required minLength={3} maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="input-base h-auto py-2 resize-none" />
            </div>
            <p className="text-xs text-warning-900 bg-warning-50 rounded-lg px-3 py-2">Le montant est immédiatement déduit de votre portefeuille. Notre équipe effectue ensuite le remboursement au client ; s&apos;il est refusé, le montant vous est recrédité.</p>
          </form>
        </SimpleModal>
      )}
    </div>
  );
}
