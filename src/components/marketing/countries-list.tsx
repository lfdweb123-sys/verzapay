"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useCountries } from "@/lib/use-countries";

const CHANNEL_LABELS: Record<string, string> = {
  MOBILE_MONEY: "Mobile Money",
  CREDIT_CARD: "Carte bancaire",
  CARD: "Carte bancaire",
  BANK_TRANSFER: "Virement bancaire",
};

// Drapeau à partir du code pays ISO (ex. "BJ" → 🇧🇯)
function flag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

export function CountriesList() {
  const { countries, loading, error } = useCountries();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...countries].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (!q) return sorted;
    return sorted.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q)
    );
  }, [countries, search]);

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-ink-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (error || countries.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-10 text-center">
        La liste des pays n&apos;est pas disponible pour le moment. Réessayez dans quelques instants ou{" "}
        <Link href="/contact" className="text-brand-700 hover:underline">contactez-nous</Link>.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un pays ou une devise…"
          className="input-base pl-9"
        />
      </div>

      <p className="text-sm text-ink-500">
        {filtered.length} pays disponible{filtered.length > 1 ? "s" : ""}
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((c) => (
          <div key={c.code} className="rounded-xl border border-ink-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink-900 flex items-center gap-2">
                <span className="text-xl leading-none" aria-hidden>{flag(c.code)}</span>
                {c.name}
              </p>
              <span className="text-xs text-ink-500 tabular-nums">{c.indicator.startsWith("+") ? c.indicator : `+${c.indicator}`}</span>
            </div>
            <p className="text-xs text-ink-500 mt-1">Devise : <strong className="text-ink-700">{c.currency}</strong></p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {c.paymentEnabled && (
                <span className="badge bg-success-50 text-success-700 inline-flex items-center gap-1">
                  <ArrowDownLeft size={11} /> Encaissement
                </span>
              )}
              {c.transferEnabled && (
                <span className="badge bg-brand-50 text-brand-800 inline-flex items-center gap-1">
                  <ArrowUpRight size={11} /> Décaissement
                </span>
              )}
            </div>

            {c.channels.length > 0 && (
              <p className="text-xs text-ink-500 mt-2.5">
                {c.channels.map((ch) => CHANNEL_LABELS[ch] ?? ch).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-400">
        Liste mise à jour automatiquement. Les moyens de paiement et frais détaillés sont sur la page{" "}
        <Link href="/pricing" className="text-brand-700 hover:underline">Tarifs</Link> et dans la{" "}
        <Link href="/docs#countries" className="text-brand-700 hover:underline">documentation API</Link>.
      </p>
    </div>
  );
}
