import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import { CountriesList } from "@/components/marketing/countries-list";

export const metadata: Metadata = {
  title: "Pays disponibles — Verzapay",
  description: "Liste des pays où vous pouvez encaisser et décaisser avec Verzapay, avec devises et moyens de paiement.",
};

export default function CountriesPage() {
  return (
    <article>
      <LegalPageHeader
        title="Pays disponibles"
        subtitle="Les pays où vous pouvez encaisser vos clients et envoyer de l'argent avec Verzapay, avec leurs devises et moyens de paiement."
      />
      <CountriesList />
    </article>
  );
}
