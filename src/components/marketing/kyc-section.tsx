import { ShieldCheck, ScanFace, FileCheck2, Lock } from "lucide-react";

const FEATURES = [
  { icon: FileCheck2, title: "Document d'identité", desc: "Lecture automatique de la CNI, passeport ou permis." },
  { icon: ScanFace, title: "Comparaison faciale", desc: "Vérification biométrique entre le document et un selfie." },
  { icon: ShieldCheck, title: "Contrôle AML", desc: "Vérification dans les listes de sanctions et PEP." },
  { icon: Lock, title: "Données protégées", desc: "Documents traités en mémoire, jamais stockés." },
];

export function KycSection() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Texte */}
          <div>
            <p className="text-sm font-medium text-brand-700">Confiance &amp; conformité</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-medium text-ink-900 tracking-tight">
              Chaque marchand est vérifié avant son premier encaissement
            </h2>
            <p className="mt-4 text-ink-600 text-base leading-relaxed">
              Verzapay intègre une vérification d&apos;identité complète à l&apos;inscription. Vos clients et vos partenaires savent qu&apos;ils traitent avec des marchands authentifiés — un gage de confiance qui protège tout l&apos;écosystème.
            </p>

            <div className="mt-8 grid sm:grid-cols-2 gap-5">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <f.icon size={16} className="text-brand-700" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{f.title}</p>
                    <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carte visuelle statut KYC */}
          <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-6 sm:p-8">
            <div className="rounded-xl bg-white border border-ink-200 p-5 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-700 flex items-center justify-center text-white text-sm font-semibold">
                    BF
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">Boutique Faso</p>
                    <p className="text-xs text-ink-500">Bénin · E-commerce</p>
                  </div>
                </div>
                <span className="badge bg-success-50 text-success-900">Vérifié</span>
              </div>

              <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
                {[
                  { label: "Document d'identité", done: true },
                  { label: "Comparaison faciale", done: true },
                  { label: "Vérification téléphone", done: true },
                  { label: "Contrôle AML / PEP", done: true },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span className="text-ink-600">{item.label}</span>
                    <ShieldCheck size={15} className="text-success-600" />
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between">
                <span className="text-xs text-ink-500">Score de confiance</span>
                <span className="text-sm font-medium text-ink-900">92 / 100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
