"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat, Plus, Loader2, Pause, Play, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { SimpleModal, StatusPill } from "@/components/ui/simple-modal";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface Sub { id: string; customerName: string; customerPhone: string; customerEmail: string; amount: number; currency: string; interval: "weekly" | "monthly" | "yearly"; status: "active" | "paused" | "cancelled"; nextRunAt: number; runs: number; lastRunAt: number | null; lastError: string | null; description: string }

const INTERVAL = { weekly: "Chaque semaine", monthly: "Chaque mois", yearly: "Chaque année" } as const;
const STATUS = { active: { tone: "green", label: "Actif" }, paused: { tone: "amber", label: "En pause" }, cancelled: { tone: "gray", label: "Annulé" } } as const;

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerEmail: "", amount: "", currency: "XOF", interval: "monthly", startDate: "", description: "" });
  const pg = usePagination(subs, 20);

  const load = useCallback(async () => {
    if (!user || !activeCompany) return;
    try {
      const res = await fetch(`/api/subscriptions?uid=${user.uid}&companyId=${activeCompany.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setSubs(data.subscriptions);
    } catch (e) { show((e as Error).message, "error"); } finally { setLoading(false); }
  }, [user, activeCompany, show]);
  useEffect(() => { load(); }, [load]);

  async function call(body: Record<string, unknown>) {
    if (!user || !activeCompany) return false;
    const res = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: user.uid, companyId: activeCompany.id, ...body }) });
    const data = await res.json();
    if (!res.ok) { show(data.error ?? "Erreur", "error"); return false; }
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await call({
      action: "create", ...form, amount: Number(form.amount),
      startAt: form.startDate ? new Date(`${form.startDate}T08:00:00Z`).getTime() : undefined,
    });
    if (ok) { show("Abonnement créé", "success"); setOpen(false); setForm({ ...form, customerName: "", customerPhone: "", customerEmail: "", amount: "", description: "" }); await load(); }
    setBusy(false);
  }

  const act = async (id: string, action: "pause" | "resume" | "cancel") => { if (await call({ action, subscriptionId: id })) await load(); };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium text-ink-900"><Repeat size={18} /> Facturation récurrente</h1>
          <p className="text-sm text-ink-500">{activeCompany?.name} — un lien de paiement est envoyé automatiquement au client à chaque échéance</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary h-9 text-sm whitespace-nowrap"><Plus size={15} /> Nouvel abonnement</button>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? <div className="flex justify-center py-16 text-ink-400"><Loader2 className="animate-spin" /></div>
        : subs.length === 0 ? <p className="text-sm text-ink-400 text-center py-14">Aucun abonnement.</p>
        : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((s) => (
              <div key={s.id} className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{s.customerName}</p>
                  <p className="text-xs text-ink-500">{s.amount.toLocaleString("fr-FR")} {s.currency} · {INTERVAL[s.interval]} · {s.runs} facture(s) envoyée(s)</p>
                  {s.status === "active" && <p className="text-xs text-ink-400">Prochaine échéance : {new Date(s.nextRunAt).toLocaleDateString("fr-FR")}</p>}
                  {s.lastError && <p className="text-xs text-danger-700">Dernier échec : {s.lastError}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</StatusPill>
                  {s.status === "active" && <button onClick={() => act(s.id, "pause")} className="btn-secondary h-8 px-2.5 text-xs"><Pause size={13} /> Pause</button>}
                  {s.status === "paused" && <button onClick={() => act(s.id, "resume")} className="btn-secondary h-8 px-2.5 text-xs"><Play size={13} /> Reprendre</button>}
                  {s.status !== "cancelled" && <button onClick={() => { if (confirm("Annuler définitivement cet abonnement ?")) act(s.id, "cancel"); }} className="btn-danger h-8 px-2.5 text-xs"><XCircle size={13} /> Annuler</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />

      {open && (
        <SimpleModal title="Nouvel abonnement" onClose={() => setOpen(false)} footer={<>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1">Annuler</button>
          <button type="submit" form="sub-form" disabled={busy} className="btn-primary flex-1">{busy && <Loader2 size={14} className="animate-spin" />} Créer</button>
        </>}>
          <form id="sub-form" onSubmit={create} className="space-y-4">
            <div><label className="label-base">Nom du client *</label><input required value={form.customerName} onChange={set("customerName")} className="input-base" /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label-base">Téléphone * (international)</label><input required type="tel" value={form.customerPhone} onChange={set("customerPhone")} placeholder="+22951345789" className="input-base" /></div>
              <div><label className="label-base">Email * (reçoit le lien)</label><input required type="email" value={form.customerEmail} onChange={set("customerEmail")} className="input-base" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><label className="label-base">Montant *</label><input required type="number" min="100" value={form.amount} onChange={set("amount")} className="input-base" /></div>
              <div><label className="label-base">Devise</label><select value={form.currency} onChange={set("currency")} className="input-base"><option>XOF</option><option>EUR</option><option>USD</option></select></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label-base">Fréquence</label><select value={form.interval} onChange={set("interval")} className="input-base"><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option><option value="yearly">Chaque année</option></select></div>
              <div><label className="label-base">Première facture le</label><input type="date" value={form.startDate} onChange={set("startDate")} className="input-base" /><p className="text-[11px] text-ink-400 mt-1">Vide = prochain passage automatique.</p></div>
            </div>
            <div><label className="label-base">Description</label><input value={form.description} onChange={set("description")} className="input-base" placeholder="Ex : Abonnement mensuel" /></div>
          </form>
        </SimpleModal>
      )}
    </div>
  );
}
