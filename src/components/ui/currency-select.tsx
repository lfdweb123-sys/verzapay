"use client";

import { useCurrencies } from "@/lib/use-countries";

export function CurrencySelect({ value, onChange, className = "input-base", id }: { value: string; onChange: (c: string) => void; className?: string; id?: string }) {
  const currencies = useCurrencies();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Devise">
      {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}
