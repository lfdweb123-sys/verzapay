import { Smartphone, CreditCard, CheckCircle2 } from "lucide-react";

const MOBILE_OPERATORS = ["MTN Mobile Money", "Moov Money", "Orange Money", "Wave"];
const CARD_NETWORKS = ["Visa", "Mastercard"];

export function PaymentMethods() {
  return (
    <section id="paiements" className="py-20 sm:py-28 bg-ink-50/60 border-y border-ink-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-700">Moyens de paiement</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-medium text-ink-900 tracking-tight">
            Vos clients paient comme ils en ont l&apos;habitude
          </h2>
          <p className="mt-4 text-ink-600 text-base leading-relaxed">
            Mobile Money reste le moyen de paiement le plus utilisé en Afrique de l&apos;Ouest. Verzapay couvre aussi la carte bancaire pour ne perdre aucune vente.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 gap-5">
          {/* Mobile Money */}
          <div className="rounded-2xl border border-ink-200 bg-white p-7">
            <div className="w-12 h-12 rounded-xl bg-brand-700 flex items-center justify-center">
              <Smartphone size={22} className="text-white" />
            </div>
            <p className="mt-5 text-lg font-medium text-ink-900">Mobile Money</p>
            <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">
              Le moyen de paiement de référence pour vos clients. Encaissement instantané, sans application à installer.
            </p>
            <ul className="mt-5 space-y-2">
              {MOBILE_OPERATORS.map((op) => (
                <li key={op} className="flex items-center gap-2 text-sm text-ink-700">
                  <CheckCircle2 size={15} className="text-brand-600 shrink-0" />
                  {op}
                </li>
              ))}
            </ul>
          </div>

          {/* Carte bancaire */}
          <div className="rounded-2xl border border-ink-200 bg-white p-7">
            <div className="w-12 h-12 rounded-xl bg-ink-900 flex items-center justify-center">
              <CreditCard size={22} className="text-white" />
            </div>
            <p className="mt-5 text-lg font-medium text-ink-900">Carte bancaire</p>
            <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">
              Pour vos clients qui préfèrent payer par carte, en ligne ou à distance, en toute sécurité.
            </p>
            <ul className="mt-5 space-y-2">
              {CARD_NETWORKS.map((net) => (
                <li key={net} className="flex items-center gap-2 text-sm text-ink-700">
                  <CheckCircle2 size={15} className="text-brand-600 shrink-0" />
                  {net}
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm text-ink-700">
                <CheckCircle2 size={15} className="text-brand-600 shrink-0" />
                Paiement 3D Secure
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
