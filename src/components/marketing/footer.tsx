import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Mail, MapPin } from "lucide-react";

const COLUMNS = [
  {
    title: "Produit",
    links: [
      { label: "Fonctionnement", href: "#fonctionnement" },
      { label: "Moyens de paiement", href: "#paiements" },
      { label: "Tarifs", href: "#tarifs" },
      { label: "Documentation API", href: "/docs" },
      { label: "Espace développeur", href: "/developers" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { label: "À propos", href: "/about" },
      { label: "Sécurité & conformité", href: "/security" },
      { label: "Centre d'aide", href: "/help" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Légal",
    links: [
      { label: "Conditions d'utilisation", href: "/terms" },
      { label: "Politique de confidentialité", href: "/privacy" },
      { label: "Politique KYC / AML", href: "/kyc-policy" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-white border-t border-ink-200">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
          {/* Bloc marque */}
          <div>
            <Logo size="md" />
            <p className="mt-4 text-sm text-ink-500 leading-relaxed max-w-xs">
              La passerelle de paiement pensée pour l&apos;Afrique. Mobile Money, carte bancaire et vérification d&apos;identité, réunis dans une seule plateforme.
            </p>
            <div className="mt-5 space-y-2">
              <a href="mailto:contact@verzapay.com" className="flex items-center gap-2 text-sm text-ink-600 hover:text-brand-700 transition-colors">
                <Mail size={14} />
                contact@verzapay.com
              </a>
              <p className="flex items-center gap-2 text-sm text-ink-500">
                <MapPin size={14} />
                Cotonou, Bénin
              </p>
            </div>
          </div>

          {/* Colonnes de liens */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-medium text-ink-900">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-ink-500 hover:text-ink-900 transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Disclaimer réglementaire */}
        <div className="mt-10 pt-6 border-t border-ink-100">
          <p className="text-xs text-ink-400 leading-relaxed max-w-3xl">
            Verzapay n&apos;est pas une banque et ne fournit pas elle-même de services de monnaie électronique. Les opérations d&apos;encaissement et de décaissement sont exécutées par l&apos;intermédiaire de solutions de paiement agréées, intégrées à notre plateforme.
          </p>
        </div>

        {/* Bas de footer */}
        <div className="mt-6 pt-6 border-t border-ink-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-ink-400">
            © {new Date().getFullYear()} Verzapay. Tous droits réservés.
          </p>
          <p className="text-xs text-ink-400">
            Paiements sécurisés · Vérification d&apos;identité via VerifyPro Africa
          </p>
        </div>
      </div>
    </footer>
  );
}
