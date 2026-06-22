import { UserPlus, ShieldCheck, Link2, Wallet } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: UserPlus,
    title: "Créez votre compte",
    desc: "Inscrivez-vous en moins de 2 minutes avec votre email ou votre compte Google. Aucune carte bancaire requise pour démarrer.",
  },
  {
    n: "02",
    icon: ShieldCheck,
    title: "Vérifiez votre identité",
    desc: "Complétez la vérification KYC (pièce d'identité + selfie) directement depuis votre tableau de bord. Validation automatique en quelques minutes.",
  },
  {
    n: "03",
    icon: Link2,
    title: "Encaissez vos clients",
    desc: "Générez un lien de paiement ou intégrez notre API. Vos clients règlent par Mobile Money ou carte bancaire, en toute simplicité.",
  },
  {
    n: "04",
    icon: Wallet,
    title: "Suivez et reversez",
    desc: "Visualisez votre solde net en temps réel et demandez vos retraits vers Mobile Money quand vous le souhaitez.",
  },
];

export function HowItWorks() {
  return (
    <section id="fonctionnement" className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-medium text-brand-700">Fonctionnement</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-medium text-ink-900 tracking-tight">
            De l&apos;inscription au premier encaissement, en 4 étapes
          </h2>
          <p className="mt-4 text-ink-600 text-base leading-relaxed">
            Chaque étape est conçue pour vous faire gagner du temps, sans sacrifier la conformité.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-200 rounded-2xl overflow-hidden border border-ink-200">
          {STEPS.map((step) => (
            <div key={step.n} className="bg-white p-6 sm:p-7 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                  <step.icon size={18} className="text-brand-700" />
                </div>
                <span className="text-xs font-mono text-ink-300">{step.n}</span>
              </div>
              <div>
                <p className="font-medium text-ink-900">{step.title}</p>
                <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}