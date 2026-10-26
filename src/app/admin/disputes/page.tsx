"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Scale, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { SimpleModal, StatusPill } from "@/components/ui/simple-modal";
import { Pagination, usePagination } from "@/components/ui/pagination";

type St = "open" | "under_review" | "resolved" | "rejected";
interface Dispute { id: string; companyName: string; txId: string; amount: number; type: string; description: string; status: St; createdAt: number; updatedAt: number }
interface Message { from: "merchant" | "support"; authorName: string; text: string; createdAt: number }
const TYPES: Record<string, string> = { not_received: "Paiement non reçu", duplicate: "Paiement en double", wrong_amount: "Montant incorrect", fraud: "Fraude suspectée", other: "Autre" };
const STATUS = { open: { tone: "amber", label: "Ouvert" }, under_review: { tone: "blue", label: "En examen" }, resolved: { tone: "green", label: "Résolu" }, rejected: { tone: "red", label: "Rejeté" } } as const;

export default function AdminDisputesPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [items, setItems] = useState<Dispute[]>([]);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<{ dispute: Dispute; messages: Message[] } | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const res = await fetch(`/api/admin/disputes?uid=${user.uid}`);
    const data = await res.json();
    if (res.ok) setItems(data.disputes); else show(data.error ?? "Erreur", "error");
    setLoading(false);
  }, [user, show]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => items.filter((d) => filter === "all" || ["open", "under_review"].includes(d.status)), [items, filter]);
  const pg = usePagination(shown, 20, filter);

  async function openThread(id: string) {
    if (!user) return;
    const res = await fetch(`/api/admin/disputes?uid=${user.uid}&disputeId=${id}`);
    const data = await res.json();
    if (res.ok) setThread(data); else show(data.error ?? "Erreur", "error");
  }

  async function update(body: { text?: string; status?: St }) {
    if (!user || !thread) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispute-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminUid: user.uid, disputeId: thread.dispute.id, ...body }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setReply("");
      await Promise.all([openThread(thread.dispute.id), load()]);
    } catch (e) { show((e as Error).message, "error"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium text-ink-900"><Scale size={18} /> Litiges</h1>
          <p className="text-sm text-ink-500">Échanges avec les marchands et décision finale.</p>
        </div>
        <div className="flex gap-2">
          {(["active", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`h-9 px-3 rounded-lg border text-sm font-medium ${filter === f ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}>{f === "active" ? "En cours" : "Tous"}</button>
          ))}
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? <div className="flex justify-center py-16 text-ink-400"><Loader2 className="animate-spin" /></div>
        : shown.length === 0 ? <p className="text-sm text-ink-400 text-center py-14">Aucun litige.</p>
        : <div className="divide-y divide-ink-50">
            {pg.pageItems.map((d) => (
              <button key={d.id} onClick={() => openThread(d.id)} className="w-full text-left px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-ink-50/60">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{d.companyName} — {TYPES[d.type] ?? d.type}</p>
                  <p className="text-xs text-ink-500">{new Date(d.updatedAt).toLocaleString("fr-FR")} · {d.description.slice(0, 80)}{d.description.length > 80 ? "…" : ""}</p>
                </div>
                <div className="flex items-center gap-3"><span className="text-sm tabular-nums">{d.amount.toLocaleString("fr-FR")} XOF</span><StatusPill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusPill></div>
              </button>
            ))}
          </div>}
      </div>
      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />

      {thread && (
        <SimpleModal wide title={`${thread.dispute.companyName} — ${TYPES[thread.dispute.type] ?? "Litige"}`} onClose={() => setThread(null)}
          footer={<div className="w-full space-y-2">
            <form onSubmit={(e) => { e.preventDefault(); if (reply.trim()) update({ text: reply }); }} className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Répondre au marchand…" className="input-base" maxLength={2000} />
              <button type="submit" disabled={busy || !reply.trim()} className="btn-primary px-3"><Send size={15} /></button>
            </form>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => update({ status: "under_review" })} disabled={busy} className="btn-secondary h-8 px-2.5 text-xs">En examen</button>
              <button onClick={() => update({ status: "resolved", text: reply || undefined })} disabled={busy} className="btn-primary h-8 px-2.5 text-xs">Résolu (en faveur du marchand)</button>
              <button onClick={() => update({ status: "rejected", text: reply || undefined })} disabled={busy} className="btn-danger h-8 px-2.5 text-xs">Rejeter</button>
            </div>
          </div>}>
          <p className="text-xs text-ink-500">Statut : <StatusPill tone={STATUS[thread.dispute.status].tone}>{STATUS[thread.dispute.status].label}</StatusPill> · Montant {thread.dispute.amount.toLocaleString("fr-FR")} XOF</p>
          <div className="space-y-3">
            {thread.messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${m.from === "support" ? "ml-auto bg-brand-50" : "bg-ink-50"}`}>
                <p className="text-[11px] text-ink-500 mb-0.5">{m.authorName} · {new Date(m.createdAt).toLocaleString("fr-FR")}</p>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>
            ))}
          </div>
        </SimpleModal>
      )}
    </div>
  );
}
