"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Download, Percent, Wallet, Receipt, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/badges";
import { cn } from "@/lib/utils";

interface Summary {
  from: number;
  to: number;
  currency: string;
  currencies: string[];
  truncated: boolean;
  totals: { volume: number; commission: number; net: number; count: number; avgCommission: number; effectiveRate: number };
  daily: { date: string; volume: number; commission: number; count: number }[];
  byMethod: { method: string; volume: number; commission: number; count: number }[];
  byCompany: { companyId: string; name: string; volume: number; commission: number; count: number; rate: number }[];
}

const PRESETS = [
  { id: "7", label: "7 jours", days: 7 },
  { id: "30", label: "30 jours", days: 30 },
  { id: "90", label: "90 jours", days: 90 },
  { id: "365", label: "12 mois", days: 365 },
  { id: "custom", label: "Personnalisé", days: 0 },
] as const;

const METHOD_LABELS: Record<string, string> = {
  mobile_money: "Mobile Money",
  card: "Carte bancaire",
  bank_transfer: "Virement bancaire",
};

const nf = new Intl.NumberFormat("fr-FR");
const fmt = (n: number, cur: string) => `${nf.format(Math.round(n))} ${cur}`;
const toInputDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default function AdminCommissionsPage() {
  const { user } = useAuth();
  const { show } = useToast();

  const [preset, setPreset] = useState<string>("30");
  const [fromDate, setFromDate] = useState(toInputDate(Date.now() - 30 * 24 * 3600 * 1000));
  const [toDate, setToDate] = useState(toInputDate(Date.now()));
  const [currency, setCurrency] = useState<string>("");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const range = useMemo(() => {
    if (preset !== "custom") {
      const days = PRESETS.find((p) => p.id === preset)?.days ?? 30;
      const to = Date.now();
      return { from: to - days * 24 * 3600 * 1000, to };
    }
    const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
    const to = new Date(`${toDate}T23:59:59.999Z`).getTime();
    return { from, to };
  }, [preset, fromDate, toDate]);

  const query = useCallback(
    () => `uid=${user?.uid}&from=${range.from}&to=${range.to}${currency ? `&currency=${currency}` : ""}`,
    [user?.uid, range.from, range.to, currency]
  );

  useEffect(() => {
    if (!user) return;
    if (Number.isNaN(range.from) || Number.isNaN(range.to) || range.from > range.to) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/commissions?${query()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erreur");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) show((err as Error).message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, range.from, range.to, currency]);

  async function download(type: "transactions" | "daily" | "companies") {
    setDownloading(type);
    try {
      const res = await fetch(`/api/admin/commissions/report?${query()}&type=${type}`);
      if (!res.ok) throw new Error("Téléchargement impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `commissions-${type}-${toInputDate(range.from)}_${toInputDate(range.to)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setDownloading(null);
    }
  }

  const cur = data?.currency ?? "XOF";
  const maxMethod = Math.max(1, ...(data?.byMethod.map((m) => m.commission) ?? [1]));

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Commissions Verzapay</h1>
          <p className="text-sm text-ink-500">Commissions prélevées sur les paiements encaissés avec succès, rapports et statistiques.</p>
        </div>
        {data && data.currencies.length > 1 && (
          <select value={data.currency} onChange={(e) => setCurrency(e.target.value)} className="input-base w-auto">
            {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Période */}
      <div className="card-base p-3.5 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id} onClick={() => setPreset(p.id)}
            className={cn("h-9 px-3 rounded-lg border text-sm font-medium transition-colors",
              preset === p.id ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50")}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} className="input-base w-auto" />
            <span className="text-ink-400 text-sm">→</span>
            <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} className="input-base w-auto" />
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : data ? (
        <>
          {data.truncated && (
            <div className="flex items-center gap-2 text-sm text-warning-900 bg-warning-50 rounded-lg px-3 py-2.5">
              <AlertTriangle size={15} /> Plus de 5 000 transactions sur la période : seules les plus récentes sont prises en compte. Réduisez la période pour des chiffres complets.
            </div>
          )}

          {/* KPI */}
          <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", loading && "opacity-60")}>
            {[
              { label: "Commissions perçues", value: fmt(data.totals.commission, cur), icon: Wallet, strong: true },
              { label: "Volume encaissé", value: fmt(data.totals.volume, cur), icon: TrendingUp },
              { label: "Transactions", value: nf.format(data.totals.count), icon: Receipt },
              { label: "Taux effectif moyen", value: `${(data.totals.effectiveRate * 100).toFixed(2)} %`, icon: Percent },
            ].map((k) => (
              <div key={k.label} className="card-base p-4">
                <div className="flex items-center gap-2 text-xs text-ink-500"><k.icon size={14} /> {k.label}</div>
                <p className={cn("mt-1.5 tabular-nums font-medium text-ink-900", k.strong ? "text-xl" : "text-lg")}>{k.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-500 -mt-2">
            Commission moyenne par transaction : <strong>{fmt(data.totals.avgCommission, cur)}</strong> · Net reversé aux marchands : <strong>{fmt(data.totals.net, cur)}</strong>
          </p>

          {/* Courbe */}
          <div className="card-base p-4">
            <p className="text-sm font-medium text-ink-900 mb-3">Commissions par jour</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e0" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v: number) => nf.format(v)} />
                  <Tooltip
                    formatter={(v) => [fmt(Number(v ?? 0), cur), "Commission"]}
                    labelFormatter={(l) => new Date(String(l)).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                  />
                  <Bar dataKey="commission" fill="#378ADD" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
            {/* Par méthode */}
            <div className="card-base p-4">
              <p className="text-sm font-medium text-ink-900 mb-3">Par moyen de paiement</p>
              {data.byMethod.length === 0 ? (
                <p className="text-sm text-ink-400 py-6 text-center">Aucune donnée</p>
              ) : (
                <div className="space-y-3">
                  {data.byMethod.map((m) => (
                    <div key={m.method}>
                      <div className="flex justify-between text-sm">
                        <span className="text-ink-700">{METHOD_LABELS[m.method] ?? m.method} <span className="text-ink-400">({m.count})</span></span>
                        <span className="font-medium tabular-nums">{fmt(m.commission, cur)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-ink-100 mt-1 overflow-hidden">
                        <div className="h-full bg-brand-600 rounded-full" style={{ width: `${(m.commission / maxMethod) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top entreprises */}
            <div className="card-base overflow-hidden">
              <p className="text-sm font-medium text-ink-900 px-4 py-3 border-b border-ink-100">Top entreprises (par commission)</p>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50/50">
                      <th className="text-left px-4 py-2 text-xs font-medium text-ink-500">Entreprise</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-ink-500">Trans.</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-ink-500">Volume</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-ink-500">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {data.byCompany.slice(0, 15).map((c) => (
                      <tr key={c.companyId}>
                        <td className="px-4 py-2.5 font-medium text-ink-900">{c.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(c.volume, cur)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap font-medium">{fmt(c.commission, cur)}</td>
                      </tr>
                    ))}
                    {data.byCompany.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-ink-400 py-6">Aucune donnée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Rapports */}
          <div className="card-base p-4">
            <p className="text-sm font-medium text-ink-900">Rapports à télécharger (CSV, compatible Excel)</p>
            <p className="text-xs text-ink-500 mt-0.5 mb-3">Les rapports couvrent la période et la devise sélectionnées.</p>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "transactions", label: "Détail des transactions" },
                { id: "daily", label: "Récapitulatif par jour" },
                { id: "companies", label: "Récapitulatif par entreprise" },
              ] as const).map((r) => (
                <button key={r.id} onClick={() => download(r.id)} disabled={downloading !== null} className="btn-secondary text-sm">
                  {downloading === r.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
