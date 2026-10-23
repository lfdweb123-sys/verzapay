"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { useCountries } from "@/lib/use-countries";

interface Fx { rates: Record<string, number>; updatedAt: number }

const BASE_CURRENCIES = ["XOF", "EUR", "USD"];

function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function CurrenciesList() {
  const { countries, loading, error } = useCountries();
  const [fx, setFx] = useState<Fx | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/public/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFx(d))
      .catch(() => setFx(null));
  }, []);

  const rows = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const code of BASE_CURRENCIES) map.set(code, []);
    for (const c of countries) {
      if (!c.currency) continue;
      map.set(c.currency, [...(map.get(c.currency) ?? []), c.name]);
    }
    const q = search.trim().toLowerCase();
    return Array.from(map.entries())
      .map(([code, names]) => ({ code, name: currencyName(code), countries: names.sort((a, b) => a.localeCompare(b, "fr")) }))
      .filter((r) => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.countries.some((n) => n.toLowerCase().includes(q)))
      .sort((a, b) => {
        const ia = BASE_CURRENCIES.indexOf(a.code), ib = BASE_CURRENCIES.indexOf(b.code);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.code.localeCompare(b.code);
      });
  }, [countries, search]);

  if (loading) {
    return <div className="flex justify-center py-16 text-ink-400"><Loader2 size={22} className="animate-spin" /></div>;
  }
  if (error && countries.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-10 text-center">
        La liste des devises n&apos;est pas disponible pour le moment. Réessayez dans quelques instants.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une devise ou un pays…" className="input-base pl-9" />
      </div>

      <p className="text-sm text-ink-500">{rows.length} devise{rows.length > 1 ? "s" : ""} acceptée{rows.length > 1 ? "s" : ""}</p>

      <div className="rounded-xl border border-ink-200 divide-y divide-ink-100">
        {rows.map((r) => {
          const perXof = fx?.rates?.[r.code];
          const xofPerUnit = r.code === "XOF" ? 1 : perXof ? 1 / perXof : null;
          return (
            <div key={r.code} className="p-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">
                  <span className="font-mono">{r.code}</span> <span className="text-ink-500 font-normal">— {r.name}</span>
                </p>
                {r.countries.length > 0 && <p className="text-xs text-ink-500 mt-1">{r.countries.join(", ")}</p>}
                {BASE_CURRENCIES.includes(r.code) && r.code !== "XOF" && r.countries.length === 0 && (
                  <p className="text-xs text-ink-500 mt-1">Devise internationale acceptée pour créer vos paiements</p>
                )}
              </div>
              <p className="text-sm text-ink-700 tabular-nums whitespace-nowrap">
                {xofPerUnit !== null
                  ? `1 ${r.code} ≈ ${xofPerUnit.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} XOF`
                  : "Taux indisponible"}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-400">
        Liste et taux mis à jour automatiquement{fx?.updatedAt ? ` (taux du ${new Date(fx.updatedAt).toLocaleString("fr-FR")})` : ""}. Les taux sont indicatifs.
        Voir aussi les <Link href="/countries" className="text-brand-700 hover:underline">pays disponibles</Link> et les{" "}
        <Link href="/pricing" className="text-brand-700 hover:underline">tarifs</Link>.
      </p>
    </div>
  );
}
