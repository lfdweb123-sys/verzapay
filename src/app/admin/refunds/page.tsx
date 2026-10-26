"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { SimpleModal, StatusPill } from "@/components/ui/simple-modal";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface Refund { id: string; companyName: string; customerName: string; customerPhone: string; amount: number; reason: string; status: "pending" | "completed" | "rejected"; createdAt: number; adminNote?: string | null }
const STATUS = { pending: { tone: "amber", label: "À traiter" }, completed: { tone: "green", label: "Remboursé" }, rejected: { tone: "red", label: "Refusé" } } as const;

export default function AdminRefundsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<{ r: Refund; action: "complete" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const res = await fetch(`/api/admin/refunds?uid=${user.uid}`);
    const data = await res.json();
    if (res.ok) setRefunds(data.refunds); else show(data.error ?? "Erreur", "error");
    setLoading(false);
  }, [user, show]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => refunds.filter((r) => filter === "all" || r.status === "pending"), [refunds, filter]);
  const pg = usePagination(shown, 20, filter);

  async function process() {
    if (!user || !target) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/refund-process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminUid: user.uid, refundId: target.r.id, action: target.action, note: note || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show(target.action === "complete" ? "Remboursement marqué comme effectué" : "Remboursement refusé — portefeuille recrédité", "success");
      setTarget(null); setNote(""); await load();
    } catch (e) { show((e as Error).message, "error"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium text-ink-900"><RotateCcw size={18} /> Remboursements</h1>
          <p className="text-sm text-ink-500">Rembourser le client (hors plateforme), puis confirmer ici. Un refus recrédite le marchand.</p>
        </div>
        <div className="flex gap-2">
          {(["pending", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`h-9 px-3 rounded-lg border text-sm font-medium ${filter === f ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}>{f === "pending" ? "À traiter" : "Tous"}</button>
          ))}
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? <div className="flex justify-center py-16 text-ink-400"><Loader2 className="animate-spin" /></div>
        : shown.length === 0 ? <p className="text-sm text-ink-400 text-center py-14">Aucun remboursement.</p>
        : <div className="divide-y divide-ink-50">
            {pg.pageItems.map((r) => (
              <div key={r.id} className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{r.companyName} → {r.customerName || "Client"}</p>
                  <p className="text-xs text-ink-500 font-mono select-all">{r.customerPhone}</p>
                  <p className="text-xs text-ink-500">{new Date(r.createdAt).toLocaleString("fr-FR")} · {r.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">{r.amount.toLocaleString("fr-FR")} XOF</span>
                  <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill>
                  {r.status === "pending" && <>
                    <button onClick={() => setTarget({ r, action: "complete" })} className="btn-primary h-8 px-2.5 text-xs"><CheckCircle2 size={13} /> Remboursé</button>
                    <button onClick={() => setTarget({ r, action: "reject" })} className="btn-danger h-8 px-2.5 text-xs"><XCircle size={13} /> Refuser</button>
                  </>}
                </div>
              </div>
            ))}
          </div>}
      </div>
      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />

      {target && (
        <SimpleModal title={target.action === "complete" ? "Confirmer le remboursement effectué" : "Refuser le remboursement"} onClose={() => setTarget(null)} footer={<>
          <button onClick={() => setTarget(null)} disabled={busy} className="btn-secondary flex-1">Annuler</button>
          <button onClick={process} disabled={busy} className={`${target.action === "complete" ? "btn-primary" : "btn-danger"} flex-1`}>{busy && <Loader2 size={14} className="animate-spin" />} Confirmer</button>
        </>}>
          <p className="text-sm text-ink-600">
            {target.action === "complete"
              ? `Confirmez avoir remboursé ${target.r.amount.toLocaleString("fr-FR")} XOF à ${target.r.customerName || "ce client"} (${target.r.customerPhone}).`
              : `${target.r.amount.toLocaleString("fr-FR")} XOF seront recrédités sur le portefeuille de ${target.r.companyName}.`}
          </p>
          <div><label className="label-base">{target.action === "complete" ? "Référence / note (optionnel)" : "Motif du refus (envoyé au marchand)"}</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-base h-auto py-2 resize-none" /></div>
        </SimpleModal>
      )}
    </div>
  );
}
