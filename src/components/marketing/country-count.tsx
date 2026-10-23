"use client";

import { useCountries } from "@/lib/use-countries";

/** Nombre de pays couverts, synchronisé automatiquement avec les pays réellement disponibles. */
export function CountryCount() {
  const { countries, loading } = useCountries();
  if (loading) return <span className="opacity-40">…</span>;
  if (countries.length === 0) return <>—</>;
  return <>{countries.length} pays</>;
}
