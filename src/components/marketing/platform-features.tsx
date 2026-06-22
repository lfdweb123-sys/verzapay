import { LayoutDashboard, Building2, Code2, BellRing } from "lucide-react";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Tableau de bord en temps réel",
    desc: "Suivez vos paiements entrants, sortants et votre solde net depuis une interface claire, pensée pour la gestion financière au quotidien.",
  },
  {
    icon: Building2,
    title: "Multi-entreprise",
    desc: "Gérez plusieurs entreprises depuis un seul compte. Chaque entreprise dispose de son propre KYC, de ses propres clés et de son propre solde.",
  },
  {
    icon: Code2,
    title: "API pour développeurs",
    desc: "Intégrez l'encaissement directement dans votre site ou votre application avec une API REST simple et des webhooks fiables.",
  },
  {
    icon: BellRing,
    title: "Notifications instantanées",
    desc: "Recevez une alerte push et un email à chaque paiement reçu, retrait traité ou mise à jour de votre statut KYC.",
  },
];

export function PlatformFeatures() {
  return (
    <section className="py-20 sm:py-28 bg-ink-50/60 border-y border-ink-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-700">Plateforme</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-medium text-ink-900 tracking-tight">
            Tout ce qu&apos;il faut pour piloter votre activité
          </h2>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-7">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center">
                <f.icon size={20} className="text-brand-700" />
              </div>
              <p className="mt-4 font-medium text-ink-900">{f.title}</p>
              <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
