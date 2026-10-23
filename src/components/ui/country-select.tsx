"use client";

import { useCountries } from "@/lib/use-countries";

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** "payment" : pays où l'encaissement est actif ; "transfer" : décaissement ; "all" : tous. */
  mode?: "payment" | "transfer" | "all";
  required?: boolean;
  className?: string;
  id?: string;
}

// Liste de pays alimentée automatiquement par la synchro JoonaPay (aucun pays saisi à la main).
export function CountrySelect({ value, onChange, mode = "all", required, className = "input-base", id }: Props) {
  const { countries, loading, error } = useCountries();
  const list = countries.filter((c) => (mode === "payment" ? c.paymentEnabled : mode === "transfer" ? c.transferEnabled : true));
  // Conserve la valeur courante même si le pays n'est plus dans la liste (ex. ancienne entreprise).
  const hasValue = !value || list.some((c) => c.code === value);
  return (
    <select id={id} required={required} value={value} onChange={(e) => onChange(e.target.value)} className={className} disabled={loading && list.length === 0}>
      {loading && list.length === 0 && <option value={value}>Chargement des pays…</option>}
      {error && list.length === 0 && <option value={value}>{value || "Liste indisponible"}</option>}
      {!hasValue && <option value={value}>{value}</option>}
      {list.map((c) => (
        <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
      ))}
    </select>
  );
}
