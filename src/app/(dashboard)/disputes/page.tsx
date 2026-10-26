"use client";

import { useCallback, useEffect, useState } from "react";
import { Scale, Plus, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { SimpleModal, StatusPill } from "@/components/ui/simple-modal";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { usePreferences } from "@/lib/preferences-context";

interface Dispute { id: string; txId: string; amount: number; type: string; description: string; status: "open" | "under_review" | "resolved" | "rejected"; createdAt: number; updatedAt: number }
interface Message { from: "merchant" | "support"; authorName: string; text: string; createdAt: number }
interface Tx { id: string; createdAt: number; customerName: string; amount: number; status: string }

const TYPES: Record<string, string> = { not_received: "Paiement non reçu", duplicate: "Paiement en double", wrong_amount: "Montant incorrect", fraud: "Fraude suspectée", other: "Autre" };
const STATUS = {
  open: { tone: "amber", label: "Ouvert" }, under_review: { tone: "blue", label: "En examen" },
  resolved: { tone: "green", label: "Résolu" }, rejected: { tone: "red", label: "Rejeté" },
} as const;

export default function DisputesPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { formatAmount } = usePreferences();
  const { show } = useToast();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [txId, setTxId] = useState("");
  const [type, setType] = useState("not_received");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<{ dispute: Dispute; messages: Message[] } | null>(null);
  const [reply, setReply] = useState("");
  const pg = usePagination(disputes, 20);

  const load = useCallback(async () => {
    if (!user || !activeCompany) return;
    try {
      const res = await fetch(`/api/disputes?uid=${user.uid}&companyId=${activeCompany.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setDisputes(data.disputes); setTxs(data.transactions);
    } catch (e) { show((e as Error).message, "error"); } finally { setLoading(false); }
  }, [user, activeCompany, show]);
  useEffect(() => { load(); }, [load]);

  async function openThread(id: string) {
    if (!user || !activeCompany) return;
    const res = await fetch(`/api/disputes?uid=${user.uid}&companyId=${activeCompany.id}&disputeId=${id}`);
    const data = await res.json();
    if (res.ok) setThread(data); else show(data.error ?? "Erreur", "error");
  }

  async function post(body: Record<string, unknown>) {
    if (!user || !activeCompany) return false;
    const res = await fetch("/api/disputes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: user.uid, companyId: activeCompany.id, ...body }) });
    const data = await res.json();
    if (!res.ok) { show(data.error ?? "Erreur", "error"); return false; }
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await post({ action: "create", txId, type, description })) {
      show("Litige ouvert : notre équipe vous répondra ici", "success");
      setOpenNew(false); setTxId(""); setDescription(""); await load();
    }
    setBusy(false);
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!thread || !reply.trim()) return;
    setBusy(true);
    if (await post({ action: "message", disputeId: thread.dispute.id, text: reply })) { setReply(""); await openThread(thread.dispute.id); }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium text-ink-900"><Scale size={18} /> Litiges</h1>
          <p className="text-sm text-ink-500">{activeCompany?.name} — signaler un problème sur une transaction</p>
        </div>
        <button onClick={() => setOpenNew(true)} className="btn-primary h-9 text-sm whitespace-nowrap"><Plus size={15} /> Ouvrir un litige</button>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? <div className="flex justify-center py-16 text-ink-400"><Loader2 className="animate-spin" /></div>
        : disputes.length === 0 ? <p className="text-sm text-ink-400 text-center py-14">Aucun litige.</p>
        : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((d) => (
              <button key={d.id} onClick={() => openThread(d.id)} className="w-full text-left px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-ink-50/60 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{TYPES[d.type] ?? d.type}</p>
                  <p className="text-xs text-ink-500">{new Date(d.createdAt).toLocaleString("fr-FR")} · {d.description.slice(0, 70)}{d.description.length > 70 ? "…" : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">{formatAmount(d.amount)}</span>
                  <StatusPill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusPill>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />

      {openNew && (
        <SimpleModal title="Ouvrir un litige" onClose={() => setOpenNew(false)} footer={<>
          <button type="button" onClick={() => setOpenNew(false)} className="btn-secondary flex-1">Annuler</button>
          <button type="submit" form="dispute-form" disabled={busy || !txId} className="btn-primary flex-1">{busy && <Loader2 size={14} className="animate-spin" />} Envoyer</button>
        </>}>
          <form id="dispute-form" onSubmit={create} className="space-y-4">
            <div>
              <label className="label-base">Transaction concernée *</label>
              <select required value={txId} onChange={(e) => setTxId(e.target.value)} className="input-base">
                <option value="">Choisir…</option>
                {txs.map((t) => <option key={t.id} value={t.id}>{new Date(t.createdAt).toLocaleDateString("fr-FR")} · {t.customerName || "Client"} · {formatAmount(t.amount)} · {t.status}</option>)}
              </select>
            </div>
            <div>
              <label className="label-base">Type de problème *</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input-base">
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label-base">Description *</label>
              <textarea required minLength={10} maxLength={2000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="input-base h-auto py-2 resize-none" placeholder="Expliquez précisément ce qui s'est passé." />
            </div>
          </form>
        </SimpleModal>
      )}

      {thread && (
        <SimpleModal wide title={`${TYPES[thread.dispute.type] ?? "Litige"} — ${STATUS[thread.dispute.status].label}`} onClose={() => setThread(null)}
          footer={["resolved", "rejected"].includes(thread.dispute.status) ? <p className="text-xs text-ink-500 w-full text-center">Ce litige est clos.</p> : (
            <form onSubmit={sendReply} className="flex gap-2 w-full">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Votre message…" className="input-base" maxLength={2000} />
              <button type="submit" disabled={busy || !reply.trim()} className="btn-primary px-3"><Send size={15} /></button>
            </form>
          )}>
          <div className="space-y-3">
            {thread.messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${m.from === "merchant" ? "ml-auto bg-brand-50 text-ink-900" : "bg-ink-50 text-ink-900"}`}>
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
