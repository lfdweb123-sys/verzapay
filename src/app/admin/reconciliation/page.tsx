"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark, Loader2, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { StatusPill } from "@/components/ui/simple-modal";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface Po {
  id: string; companyId: string; companyName: string; amount: number; status: string; method?: string; manual?: boolean;
  recipientName?: string | null; recipientBank?: string | null; recipientAccountLast4?: string | null; processedAt?: number | null; createdAt: number;
  reconciled?: boolean; bankReference?: string | null; bankAmount?: number | null; bankValueDate?: string | null; reconcileGap?: number | null;
}
type Tab = "todo" | "done" | "gaps";
const nf = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} XOF`;

export default function ReconciliationPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [items, setItems] = useState<Po[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("todo");
  const [inputs, setInputs] = useState<Record<string, { ref: string; amount: string; date: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const res = await fetch(`/api/admin/payouts?uid=${user.uid}`);
    const data = await res.json();
    if (res.ok) setItems((data.payouts as Po[]).filter((p) => p.method === "bank_transfer" && p.manual && p.status === "completed")); else show(data.error ?? "Erreur", "error");
    setLoading(false);
  }, [user, show]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const done = items.filter((p) => p.reconciled);
    return {
      total: items.reduce((s, p) => s + p.amount, 0), count: items.length,
      doneTotal: done.reduce((s, p) => s + p.amount, 0), doneCount: done.length,
      todoTotal: items.filter((p) => !p.reconciled).reduce((s, p) => s + p.amount, 0), todoCount: items.length - done.length,
      gaps: done.filter((p) => Math.abs(p.reconcileGap ?? 0) > 0.009),
    };
  }, [items]);

  const shown = useMemo(() => items.filter((p) => (tab === "todo" ? !p.reconciled : tab === "done" ? p.reconciled : p.reconciled && Math.abs(p.reconcileGap ?? 0) > 0.009)), [items, tab]);
  const pg = usePagination(shown, 20, tab);

  async function reconcile(p: Po, reconciled: boolean) {
    if (!user) return;
    const inp = inputs[p.id] ?? { ref: "", amount: String(p.amount), date: "" };
    setBusy(p.id);
    try {
      const res = await fetch("/api/admin/payout-reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUid: user.uid, companyId: p.companyId, payoutId: p.id, reconciled, bankReference: inp.ref, bankAmount: inp.amount === "" ? undefined : Number(inp.amount), valueDate: inp.date || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      if (reconciled && data.gap && Math.abs(data.gap) > 0.009) show(`Rapproché avec un écart de ${nf(data.gap)}`, "error"); else show(reconciled ? "Virement rapproché" : "Rapprochement annulé", "success");
      await load();
    } catch (e) { show((e as Error).message, "error"); } finally { setBusy(null); }
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Date traitement", "Entreprise", "Bénéficiaire", "Banque", "Montant attendu", "Rapproché", "Référence bancaire", "Montant banque", "Date de valeur", "Écart"].map(esc).join(";")];
    for (const p of items) lines.push([p.processedAt ? new Date(p.processedAt).toLocaleDateString("fr-FR") : "", p.companyName, p.recipientName, p.recipientBank, p.amount, p.reconciled ? "Oui" : "Non", p.bankReference, p.bankAmount, p.bankValueDate, p.reconcileGap].map(esc).join(";"));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapprochement-virements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const set = (id: string, p: Po, k: "ref" | "amount" | "date", v: string) =>
    setInputs((prev) => ({ ...prev, [id]: { ref: prev[id]?.ref ?? "", amount: prev[id]?.amount ?? String(p.amount), date: prev[id]?.date ?? "", [k]: v } }));

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium text-ink-900"><Landmark size={18} /> Rapprochement bancaire</h1>
          <p className="text-sm text-ink-500">Comparez chaque virement manuel payé avec la ligne de votre relevé bancaire.</p>
        </div>
        <button onClick={exportCsv} className="btn-secondary text-sm"><Download size={15} /> Exporter (CSV)</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Virements payés", value: nf(stats.total), sub: `${stats.count} virement(s)` },
          { label: "À rapprocher", value: nf(stats.todoTotal), sub: `${stats.todoCount} virement(s)` },
          { label: "Rapprochés", value: nf(stats.doneTotal), sub: `${stats.doneCount} virement(s)` },
          { label: "Écarts", value: String(stats.gaps.length), sub: stats.gaps.length ? nf(stats.gaps.reduce((s, p) => s + (p.reconcileGap ?? 0), 0)) + " au total" : "Aucun écart" },
        ].map((c) => (
          <div key={c.label} className="card-base p-4"><p className="text-xs text-ink-500">{c.label}</p><p className="mt-1 text-lg font-medium tabular-nums text-ink-900">{c.value}</p><p className="text-[11px] text-ink-400">{c.sub}</p></div>
        ))}
      </div>

      <div className="flex gap-2">
        {([["todo", "À rapprocher"], ["done", "Rapprochés"], ["gaps", "Écarts"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-9 px-3 rounded-lg border text-sm font-medium ${tab === k ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}>{l}</button>
        ))}
      </div>

      <div className="card-base overflow-hidden">
        {loading ? <div className="flex justify-center py-16 text-ink-400"><Loader2 className="animate-spin" /></div>
        : shown.length === 0 ? <p className="text-sm text-ink-400 text-center py-14">Rien à afficher.</p>
        : <div className="divide-y divide-ink-50">
            {pg.pageItems.map((p) => {
              const inp = inputs[p.id] ?? { ref: "", amount: String(p.amount), date: "" };
              const gap = p.reconcileGap ?? 0;
              return (
                <div key={p.id} className="px-4 py-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">{p.companyName} → {p.recipientName || "Bénéficiaire"}</p>
                      <p className="text-xs text-ink-500">{p.recipientBank} ••{p.recipientAccountLast4} · payé le {p.processedAt ? new Date(p.processedAt).toLocaleDateString("fr-FR") : "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">{nf(p.amount)}</span>
                      {p.reconciled ? (Math.abs(gap) > 0.009 ? <StatusPill tone="red"><AlertTriangle size={11} className="mr-1" />Écart {nf(gap)}</StatusPill> : <StatusPill tone="green"><CheckCircle2 size={11} className="mr-1" />Rapproché</StatusPill>) : <StatusPill tone="amber">À rapprocher</StatusPill>}
                    </div>
                  </div>
                  {p.reconciled ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
                      <span>Réf. <strong className="font-mono">{p.bankReference}</strong> · banque {p.bankAmount !== null && p.bankAmount !== undefined ? nf(p.bankAmount) : "—"}{p.bankValueDate ? ` · valeur ${p.bankValueDate}` : ""}</span>
                      <button onClick={() => reconcile(p, false)} disabled={busy === p.id} className="btn-secondary h-8 px-2.5 text-xs">Annuler le rapprochement</button>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
                      <div><label className="label-base text-xs">Référence bancaire *</label><input value={inp.ref} onChange={(e) => set(p.id, p, "ref", e.target.value)} className="input-base" placeholder="Libellé / n° de l'opération" /></div>
                      <div><label className="label-base text-xs">Montant sur le relevé</label><input type="number" value={inp.amount} onChange={(e) => set(p.id, p, "amount", e.target.value)} className="input-base" /></div>
                      <div><label className="label-base text-xs">Date de valeur</label><input type="date" value={inp.date} onChange={(e) => set(p.id, p, "date", e.target.value)} className="input-base" /></div>
                      <button onClick={() => reconcile(p, true)} disabled={busy === p.id || !inp.ref.trim()} className="btn-primary h-10">{busy === p.id && <Loader2 size={14} className="animate-spin" />} Rapprocher</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
      </div>
      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}
