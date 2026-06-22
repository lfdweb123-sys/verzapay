import Link from "next/link";
import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import { Rocket, ShieldCheck, Wallet, Code2, MessageCircle, ArrowRight } from "lucide-react";

const CATEGORIES = [
  {
    icon: Rocket,
    title: "Démarrer",
    items: [
      "Créer votre compte Verzapay",
      "Créer votre première entreprise",
      "Comprendre le statut KYC",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Vérification d'identité",
    items: [
      "Quels documents sont acceptés ?",
      "Combien de temps prend la vérification ?",
      "Que faire si mon KYC est rejeté ?",
    ],
  },
  {
    icon: Wallet,
    title: "Paiements & retraits",
    items: [
      "Créer un lien de paiement",
      "Demander un retrait vers Mobile Money",
      "Comprendre la commission appliquée",
    ],
  },
  {
    icon: Code2,
    title: "Développeurs",
    items: [
      "Intégrer l'API Verzapay",
      "Configurer un webhook",
      "Tester en environnement sandbox",
    ],
  },
];

export default function HelpCenterPage() {
  return (
    <article>
      <LegalPageHeader
        title="Centre d'aide"
        subtitle="Trouvez rapidement une réponse à vos questions, ou contactez notre équipe."
      />

      <div className="grid sm:grid-cols-2 gap-5">
        {CATEGORIES.map((cat) => (
          <div key={cat.title} className="rounded-xl border border-ink-200 p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <cat.icon size={18} className="text-brand-700" />
              <p className="font-medium text-ink-900">{cat.title}</p>
            </div>
            <ul className="space-y-2">
              {cat.items.map((item) => (
                <li key={item} className="text-sm text-ink-600 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-ink-300 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-brand-50 border border-brand-200 p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
            <MessageCircle size={18} className="text-brand-700" />
          </div>
          <div>
            <p className="font-medium text-ink-900">Vous ne trouvez pas votre réponse ?</p>
            <p className="text-sm text-ink-600">Notre équipe est disponible par email et WhatsApp.</p>
          </div>
        </div>
        <Link href="/contact" className="btn-primary shrink-0">
          Contacter le support <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
