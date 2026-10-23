"use client";

import { useEffect, useState } from "react";

export interface SyncedCountry {
  code: string;
  name: string;
  indicator: string;
  currency: string;
  paymentEnabled: boolean;
  transferEnabled: boolean;
  channels: string[];
}

// Pays et devises synchronisés automatiquement depuis JoonaPay via /api/public/countries (cache module + sessionStorage 10 min).
let memo: { at: number; countries: SyncedCountry[] } | null = null;
const KEY = "vpz_countries_v1";
const TTL = 10 * 60 * 1000;
let inflight: Promise<SyncedCountry[]> | null = null;

async function load(): Promise<SyncedCountry[]> {
  if (memo && Date.now() - memo.at < TTL) return memo.countries;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as { at: number; countries: SyncedCountry[] };
      if (Date.now() - d.at < TTL) { memo = d; return d.countries; }
    }
  } catch { /* stockage indisponible */ }
  inflight ??= fetch("/api/public/countries")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { countries?: SyncedCountry[] }) => {
      const countries = d.countries ?? [];
      memo = { at: Date.now(), countries };
      try { sessionStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* quota */ }
      return countries;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useCountries() {
  const [countries, setCountries] = useState<SyncedCountry[]>(memo?.countries ?? []);
  const [loading, setLoading] = useState(!memo);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    load().then((c) => { if (!cancelled) { setCountries(c); setLoading(false); } }).catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  return { countries, loading, error };
}

/** Devises acceptées pour créer un paiement ou un décaissement : XOF (défaut), EUR, USD + celles des pays synchronisés. */
export function useCurrencies(): string[] {
  const { countries } = useCountries();
  const set = new Set<string>(["XOF", "EUR", "USD"]);
  for (const c of countries) if (c.currency) set.add(c.currency);
  const rest = Array.from(set).filter((c) => !["XOF", "EUR", "USD"].includes(c)).sort();
  return ["XOF", "EUR", "USD", ...rest];
}
