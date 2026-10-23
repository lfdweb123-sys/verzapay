import { LEDGER_CURRENCY, FxError, convert, normalizeCurrency, rate } from "@/lib/fx";

/**
 * Plan de conversion d'une opération (paiement ou décaissement).
 *  - requested : montant + devise demandés par l'appelant (défaut XOF)
 *  - ledgerAmount : équivalent XOF entier (solde, commission, limites)
 *  - chargeAmount / chargeCurrency : montant réellement envoyé à JoonaPay, dans la devise du pays du client/bénéficiaire
 */
export interface ChargePlan {
  requestedAmount: number;
  requestedCurrency: string;
  ledgerAmount: number;
  chargeAmount: number;
  chargeCurrency: string;
  fxRate: number; // chargeCurrency pour 1 requestedCurrency
}

export async function planCharge(opts: { amount: number; currency?: string | null; targetCurrency: string; minLedger: number; maxLedger: number }): Promise<ChargePlan> {
  const requestedCurrency = normalizeCurrency(opts.currency);
  const chargeCurrency = normalizeCurrency(opts.targetCurrency);
  const ledgerAmount = Math.round(await convert(opts.amount, requestedCurrency, LEDGER_CURRENCY));
  if (ledgerAmount < opts.minLedger) {
    throw new FxError(`Montant trop faible : minimum ${opts.minLedger} XOF (équivalent).`, 400);
  }
  if (ledgerAmount > opts.maxLedger) {
    throw new FxError(`Montant trop élevé : maximum ${opts.maxLedger.toLocaleString("fr-FR")} XOF (équivalent).`, 400);
  }
  const chargeAmount = await convert(opts.amount, requestedCurrency, chargeCurrency);
  if (!(chargeAmount > 0)) throw new FxError("Montant converti invalide.", 400);
  return {
    requestedAmount: opts.amount,
    requestedCurrency,
    ledgerAmount,
    chargeAmount,
    chargeCurrency,
    fxRate: await rate(requestedCurrency, chargeCurrency),
  };
}

/** Champs de conversion à stocker sur la transaction / le décaissement (le ledger reste en XOF dans `amount`). */
export function planFields(p: ChargePlan) {
  return {
    requestedAmount: p.requestedAmount,
    requestedCurrency: p.requestedCurrency,
    chargeAmount: p.chargeAmount,
    chargeCurrency: p.chargeCurrency,
    fxRate: p.fxRate,
  };
}

/** Montant/devise à communiquer au marchand : ce qu'il a demandé (anciennes opérations : XOF). */
export function publicAmounts(doc: { amount?: number; requestedAmount?: number | null; requestedCurrency?: string | null }) {
  return {
    amount: doc.requestedAmount ?? doc.amount ?? 0,
    currency: doc.requestedCurrency ?? LEDGER_CURRENCY,
  };
}
