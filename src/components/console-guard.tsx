"use client";

import { useEffect } from "react";

/**
 * En production, neutralise la console du navigateur pour qu'aucune donnée
 * (utilisateurs, paiements, erreurs détaillées) ne puisse y apparaître.
 * Les journaux serveur restent disponibles dans Vercel.
 */
export function ConsoleGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const noop = () => undefined;
    const methods = ["log", "info", "debug", "warn", "error", "trace", "table", "dir", "dirxml", "group", "groupCollapsed", "groupEnd", "time", "timeEnd", "count"] as const;
    for (const m of methods) {
      try {
        (console as unknown as Record<string, unknown>)[m] = noop;
      } catch { /* console figée */ }
    }
  }, []);
  return null;
}
