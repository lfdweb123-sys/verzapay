import type { Metadata } from "next";

// Lien de paiement : jamais indexé, aucun Referer envoyé (le jeton ne doit fuiter nulle part).
export const metadata: Metadata = {
  title: "Paiement sécurisé — Verzapay",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
