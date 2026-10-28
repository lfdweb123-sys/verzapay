"use client";

import { useEffect, useState } from "react";

type S = "operational" | "degraded" | "outage";
const LABEL: Record<S, string> = { operational: "Tous les systèmes opérationnels", degraded: "Certains services sont ralentis", outage: "Incident en cours" };
const COLOR: Record<S, string> = { operational: "#4ade80", degraded: "#fbbf24", outage: "#f87171" };

/** État réel des services (même source que la page Status). */
export function LiveStatusPill() {
  const [status, setStatus] = useState<S | null>(null);
  useEffect(() => {
    fetch("/api/public/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d?.overall ?? null))
      .catch(() => setStatus(null));
  }, []);
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-xs text-white/90">
      <span className="relative flex w-2 h-2">
        <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: COLOR[status] }} />
        <span className="relative inline-flex w-2 h-2 rounded-full" style={{ backgroundColor: COLOR[status] }} />
      </span>
      {LABEL[status]}
    </span>
  );
}
