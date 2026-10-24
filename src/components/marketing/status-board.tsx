"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "operational" | "degraded" | "outage";
interface Check { id: string; name: string; description: string; status: Status; latencyMs: number | null }
interface HistoryPoint { at: number; overall: Status; c: Record<string, Status> }
interface Payload { updatedAt: number; overall: Status; components: Check[]; history?: HistoryPoint[] }

const REFRESH_MS = 30_000;
const HISTORY = 60;

// Couleurs explicites (vert = tout va bien, orange = ralenti, rouge = erreur)
const COLOR: Record<Status, string> = { operational: "#16a34a", degraded: "#f59e0b", outage: "#dc2626" };
const TEXT: Record<Status, string> = { operational: "#15803d", degraded: "#b45309", outage: "#b91c1c" };
const SOFT: Record<Status, string> = { operational: "#f0fdf4", degraded: "#fffbeb", outage: "#fef2f2" };
const EDGE: Record<Status, string> = { operational: "#bbf7d0", degraded: "#fde68a", outage: "#fecaca" };

const LABEL: Record<Status, string> = { operational: "Opérationnel", degraded: "Ralenti", outage: "Indisponible" };
const BANNER: Record<Status, { text: string; icon: typeof CheckCircle2 }> = {
  operational: { text: "Tous les systèmes sont opérationnels", icon: CheckCircle2 },
  degraded: { text: "Certains services sont ralentis", icon: AlertTriangle },
  outage: { text: "Erreur : incident en cours sur certains services", icon: XCircle },
};

export function StatusBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/public/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json: Payload = await res.json();
      setData(json);
      setError(false);
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
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3.5"
        style={{ backgroundColor: SOFT[data.overall], borderColor: EDGE[data.overall], color: TEXT[data.overall] }}
      >
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
                <p className="text-sm font-medium inline-flex items-center gap-1.5" style={{ color: TEXT[c.status] }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR[c.status] }} />
                  {LABEL[c.status]}
                </p>
                {c.latencyMs !== null && c.latencyMs > 0 && (
                  <p className="text-[11px] text-ink-400 tabular-nums mt-0.5">{c.latencyMs} ms</p>
                )}
              </div>
            </div>
            <div className="flex gap-0.5 mt-3" aria-hidden>
              {Array.from({ length: HISTORY }).map((_, i) => {
                const h = (data.history ?? []).map((p) => p.c[c.id]).filter(Boolean) as Status[];
                // La dernière barre est toujours l'état en direct
                const series = h.length ? [...h.slice(0, -1), c.status] : [c.status];
                const s = series[series.length - HISTORY + i];
                return (
                  <span
                    key={i}
                    className="h-5 flex-1 rounded-sm"
                    style={{ backgroundColor: s ? COLOR[s] : "#e5e5e0" }}
                    title={s ? LABEL[s] : "Pas de donnée"}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-400 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Une barre = une minute (les 60 dernières).</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: COLOR.operational }} /> Opérationnel</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: COLOR.degraded }} /> Ralenti</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: COLOR.outage }} /> Erreur</span>
      </p>
    </div>
  );
}
