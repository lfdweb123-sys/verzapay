"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "operational" | "degraded" | "outage";
interface Check { id: string; name: string; description: string; status: Status; latencyMs: number | null }
interface Payload { updatedAt: number; overall: Status; components: Check[] }

const REFRESH_MS = 30_000;
const HISTORY = 30;

const LABEL: Record<Status, string> = { operational: "Opérationnel", degraded: "Ralenti", outage: "Indisponible" };
const BANNER: Record<Status, { text: string; box: string; icon: typeof CheckCircle2 }> = {
  operational: { text: "Tous les systèmes sont opérationnels", box: "bg-success-50 text-success-700 border-success-200", icon: CheckCircle2 },
  degraded: { text: "Certains services sont ralentis", box: "bg-warning-50 text-warning-900 border-warning-200", icon: AlertTriangle },
  outage: { text: "Incident en cours sur certains services", box: "bg-danger-50 text-danger-700 border-danger-200", icon: XCircle },
};
const DOT: Record<Status, string> = { operational: "bg-success-600", degraded: "bg-warning-600", outage: "bg-danger-600" };

export function StatusBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Historique de la session : une barre par vérification (par service)
  const [history, setHistory] = useState<Record<string, Status[]>>({});

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/public/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json: Payload = await res.json();
      setData(json);
      setError(false);
      setHistory((prev) => {
        const next = { ...prev };
        for (const c of json.components) next[c.id] = [...(prev[c.id] ?? []), c.status].slice(-HISTORY);
        return next;
      });
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <p className="text-sm text-ink-500 py-10 text-center">
        {error ? "Impossible de récupérer l'état des services pour le moment." : "Vérification des services…"}
      </p>
    );
  }

  const banner = BANNER[data.overall];

  return (
    <div className="space-y-6">
      <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3.5", banner.box)}>
        <banner.icon size={20} className="shrink-0" />
        <p className="font-medium">{banner.text}</p>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-500">
        <span>
          Dernière vérification : {new Date(data.updatedAt).toLocaleTimeString("fr-FR")} · actualisation automatique toutes les 30 s
        </span>
        <button onClick={load} disabled={refreshing} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline disabled:opacity-50">
          <RefreshCw size={12} className={cn(refreshing && "animate-spin")} /> Actualiser
        </button>
      </div>

      <div className="rounded-xl border border-ink-200 divide-y divide-ink-100">
        {data.components.map((c) => (
          <div key={c.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{c.name}</p>
                <p className="text-xs text-ink-500 mt-0.5">{c.description}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn("text-sm font-medium inline-flex items-center gap-1.5",
                  c.status === "operational" ? "text-success-700" : c.status === "degraded" ? "text-warning-900" : "text-danger-700")}>
                  <span className={cn("w-2 h-2 rounded-full", DOT[c.status])} />
                  {LABEL[c.status]}
                </p>
                {c.latencyMs !== null && c.latencyMs > 0 && (
                  <p className="text-[11px] text-ink-400 tabular-nums mt-0.5">{c.latencyMs} ms</p>
                )}
              </div>
            </div>
            <div className="flex gap-0.5 mt-3" aria-hidden>
              {Array.from({ length: HISTORY }).map((_, i) => {
                const h = history[c.id] ?? [];
                const s = h[h.length - HISTORY + i];
                return <span key={i} className={cn("h-5 flex-1 rounded-sm", s ? DOT[s] : "bg-ink-100")} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-400">Les barres montrent les vérifications effectuées pendant votre visite sur cette page.</p>
    </div>
  );
}
