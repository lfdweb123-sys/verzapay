import Link from "next/link";
import { ArrowRight, Smartphone, CreditCard, Landmark, Wallet } from "lucide-react";
import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import {
  MOBILE_MONEY_RATES, CASH_WITHDRAWAL_RATES, BANK_PAYOUT_FEES,
  CARD_PROCESSING_FEE, SETTLEMENT_DELAY, VERZAPAY_COMMISSION_RATE,
} from "@/lib/pricing";

export default function PricingPage() {
  const byCountry = MOBILE_MONEY_RATES.reduce<Record<string, typeof MOBILE_MONEY_RATES>>((acc, r) => {
    acc[r.country] = acc[r.country] ? [...acc[r.country], r] : [r];
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 pt-28 pb-20">
      <LegalPageHeader
        title="Grille tarifaire complète"
        subtitle="Tous les frais appliqués sur Verzapay, détaillés par pays et par moyen de paiement. Aucun frais caché, aucun abonnement."
      />

      <div className="rounded-2xl border-2 border-brand-700 bg-brand-50 p-6 sm:p-8 mb-12">
        <p className="text-sm font-medium text-brand-800">Commission Verzapay</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-4xl font-medium text-ink-900 tabular-nums">{(VERZAPAY_COMMISSION_RATE * 100).toFixed(1)}</span>
          <span className="text-xl font-medium text-ink-900">%</span>
          <span className="text-sm text-ink-600 ml-2">par transaction encaissée avec succès</span>
        </div>
        <p className="text-sm text-ink-600 mt-3 leading-relaxed">
          Cette commission s&apos;ajoute aux frais de réseau de paiement détaillés ci-dessous (Mobile Money, carte, virement). Le montant total prélevé sur chaque transaction est toujours visible avant confirmation dans votre tableau de bord.
        </p>
        <Link href="/register" className="btn-primary mt-5">
          Créer un compte gratuit <ArrowRight size={15} />
        </Link>
      </div>

      <section className="mb-12">
        <div className="flex items-center gap-2.5 mb-5">
          <Smartphone size={20} className="text-brand-700" />
          <h2 className="text-xl font-medium text-ink-900">Mobile Money</h2>
        </div>
        <p className="text-sm text-ink-500 mb-5">Frais réseau appliqués en plus de la commission Verzapay, par pays et opérateur.</p>

        <div className="space-y-6">
          {Object.entries(byCountry).map(([country, rates]) => (
            <div key={country} className="rounded-xl border border-ink-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-ink-50 border-b border-ink-200">
                <p className="text-sm font-medium text-ink-900">{country}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100">
                    <th className="text-left px-4 py-2 text-xs font-medium text-ink-500">Opérateur</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-ink-500">Encaissement</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-ink-500">Décaissement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {rates.map((r) => (
                    <tr key={r.operator}>
                      <td className="px-4 py-2.5 text-ink-700">{r.operator}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.payIn}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.payOut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-2.5 mb-5">
          <CreditCard size={20} className="text-brand-700" />
          <h2 className="text-xl font-medium text-ink-900">Carte bancaire</h2>
        </div>
        <div className="rounded-xl border border-ink-200 p-5 flex items-center justify-between">
          <p className="text-sm text-ink-700">Frais de traitement carte (Visa, Mastercard)</p>
          <p className="font-medium tabular-nums">{CARD_PROCESSING_FEE}</p>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-2.5 mb-5">
          <Wallet size={20} className="text-brand-700" />
          <h2 className="text-xl font-medium text-ink-900">Retrait d&apos;espèces</h2>
        </div>
        <div className="rounded-xl border border-ink-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Pays</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Frais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {CASH_WITHDRAWAL_RATES.map((r) => (
                <tr key={r.country}>
                  <td className="px-4 py-2.5 text-ink-700">{r.country}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-2.5 mb-5">
          <Landmark size={20} className="text-brand-700" />
          <h2 className="text-xl font-medium text-ink-900">Décaissement bancaire</h2>
        </div>
        <div className="rounded-xl border border-ink-200 overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-ink-50">
              {BANK_PAYOUT_FEES.map((r) => (
                <tr key={r.zone}>
                  <td className="px-4 py-2.5 text-ink-700">{r.zone}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl bg-ink-50 border border-ink-200 p-5">
        <p className="text-sm font-medium text-ink-900 mb-1.5">Délais de règlement</p>
        <p className="text-sm text-ink-600">{SETTLEMENT_DELAY}</p>
      </section>

      <p className="text-xs text-ink-400 mt-8">
        Tarifs hors taxes applicables, sujets à modification avec préavis. Les frais réseau peuvent varier selon les conditions commerciales en vigueur avec nos partenaires techniques agréés.
      </p>
    </div>
  );
}
