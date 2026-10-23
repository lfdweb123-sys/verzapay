import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import { StatusBoard } from "@/components/marketing/status-board";

export const metadata: Metadata = {
  title: "État des services — Verzapay",
  description: "État en temps réel de l'API Verzapay, des paiements et du site web.",
};

export default function StatusPage() {
  return (
    <article>
      <LegalPageHeader
        title="État des services"
        subtitle="L'état de l'API, des paiements et du site web, vérifié en temps réel."
      />
      <StatusBoard />
    </article>
  );
}
