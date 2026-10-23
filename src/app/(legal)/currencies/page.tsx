import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import { CurrenciesList } from "@/components/marketing/currencies-list";

export const metadata: Metadata = {
  title: "Devises acceptées — Verzapay",
  description: "Liste des devises acceptées pour vos paiements et décaissements, avec les taux indicatifs, synchronisée automatiquement.",
};

export default function CurrenciesPage() {
  return (
    <article>
      <LegalPageHeader
        title="Devises acceptées"
        subtitle="Les devises que vous pouvez utiliser pour créer des paiements et des décaissements, synchronisées automatiquement."
      />
      <CurrenciesList />
    </article>
  );
}
