import Link from "next/link";
import Image from "next/image";
import { Check, ArrowRight } from "lucide-react";

const INCLUDED = [
  "Vérification KYC illimitée",
  "Liens de paiement illimités",
  "Mobile Money + carte bancaire",
  "Tableau de bord temps réel",
  "Notifications push & email",
  "Accès API complet",
  "Support par email",
];

export function Pricing() {
  return (
    <section id="tarifs" className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-medium text-brand-700">Tarifs</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-medium text-ink-900 tracking-tight">
            Un seul tarif, sans frais cachés
          </h2>
          <p className="mt-4 text-ink-600 text-base leading-relaxed">
            Pas d&apos;abonnement mensuel. Vous ne payez que lorsque vous encaissez.
          </p>
        </div>

        <div className="mt-12 flex flex-col lg:flex-row items-center gap-10 lg:gap-16 justify-center">
          {/* Image gauche */}
          <div className="w-full max-w-sm lg:max-w-md xl:max-w-lg shrink-0">
            <Image
              src="/images/p.png"
              alt="Illustration tarifs Verzapay"
              width={520}
              height={520}
              className="w-full h-auto object-contain"
              priority
            />
          </div>

          {/* Bloc pricing */}
          <div className="w-full max-w-md rounded-2xl border-2 border-brand-700 bg-white p-8 relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 bg-brand-700 text-white text-[11px] font-medium px-3 py-1 rounded-bl-lg">
              Aucun frais fixe
            </div>

            <p className="text-sm font-medium text-ink-500">Commission par transaction</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-5xl font-medium text-ink-900 tabular-nums">1,5</span>
              <span className="text-2xl font-medium text-ink-900">%</span>
            </div>
            <p className="text-sm text-ink-500 mt-1.5">Sur chaque paiement encaissé avec succès. Dégressif selon volume.</p>

            <Link href="/register" className="btn-primary w-full mt-7 h-12">
              Créer un compte gratuit
              <ArrowRight size={16} />
            </Link>

            <ul className="mt-7 space-y-3 border-t border-ink-100 pt-6">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-ink-700">
                  <Check size={16} className="text-brand-600 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <Link href="/pricing" className="block text-center text-sm text-brand-600 font-medium hover:text-brand-700 mt-5">
              Voir la grille tarifaire complète par pays →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}