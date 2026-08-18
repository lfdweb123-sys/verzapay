"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "Combien de temps prend la vérification KYC ?",
    a: "La vérification automatique prend généralement moins de 3 minutes. Dans certains cas nécessitant une revue manuelle, comptez jusqu'à 24 heures. Vous êtes notifié par email et push dès qu'une décision est prise.",
  },
  {
    q: "Quels moyens de paiement mes clients peuvent-ils utiliser ?",
    a: "Vos clients peuvent payer par Mobile Money (MTN, Moov, Orange Money, Wave) ou par carte bancaire (Visa, Mastercard). Le choix se fait directement sur la page de paiement.",
  },
  {
    q: "Comment et quand suis-je payé ?",
    a: "Chaque paiement réussi crédite automatiquement votre solde net (après commission) dans votre tableau de bord. Vous pouvez demander un retrait vers votre compte Mobile Money à tout moment.",
  },
  {
    q: "Puis-je gérer plusieurs entreprises avec un seul compte ?",
    a: "Oui. Vous pouvez créer plusieurs entreprises depuis votre tableau de bord, chacune avec son propre statut KYC, ses propres clés API et son propre solde, indépendants les uns des autres.",
  },
  {
    q: "Existe-t-il une API pour intégrer Verzapay à mon site ?",
    a: "Oui, une API REST complète est disponible depuis l'espace Développeur de votre tableau de bord, avec documentation, clés de test et webhooks pour automatiser vos intégrations.",
  },
  {
    q: "Quelle commission est appliquée sur mes paiements ?",
    a: "La commission par défaut est de 0,5 % par transaction réussie, sans frais fixe ni abonnement. Aucun frais n'est prélevé en cas d'échec du paiement.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 sm:py-28 bg-ink-50/60 border-y border-ink-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-medium text-brand-700">Questions fréquentes</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-medium text-ink-900 tracking-tight">
            Tout ce que vous devez savoir
          </h2>
        </div>

        <div className="mt-10 space-y-2.5">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="rounded-xl border border-ink-200 bg-white overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm sm:text-base font-medium text-ink-900">{item.q}</span>
                  <Plus size={18} className={cn("text-ink-400 shrink-0 transition-transform duration-200", isOpen && "rotate-45")} />
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-200 ease-out",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 text-sm text-ink-500 leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
