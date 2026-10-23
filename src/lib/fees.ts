import { roundTo } from "@/lib/fx";

export type FeeBearer = "MERCHANT" | "CUSTOMER";

export function resolveFeeBearer(requested: string | null | undefined, companyDefault: string | null | undefined): FeeBearer {
  const v = String(requested ?? companyDefault ?? "MERCHANT").toUpperCase();
  return v === "CUSTOMER" ? "CUSTOMER" : "MERCHANT";
}

export interface CollectionFees {
  bearer: FeeBearer;
  /** Commission Verzapay (XOF, ledger). Toujours perçue ; seul son payeur change. */
  commission: number;
  /** Montant crédité au marchand (XOF, ledger). */
  netAmount: number;
  /** Montant réellement demandé au client (devise de débit). */
  chargeTotal: number;
  /** Part des frais ajoutée au montant du client (devise de débit) — 0 si à la charge du marchand. */
  customerFee: number;
}

/**
 * Frais Verzapay sur un encaissement — une seule commission, payée par UNE seule partie :
 *  - MERCHANT : le client paie le montant exact, la commission est déduite de ce que reçoit le marchand.
 *  - CUSTOMER : la commission est AJOUTÉE au montant du client ; le marchand reçoit 100 % du montant demandé.
 */
export function computeCollectionFees(opts: {
  ledgerAmount: number;
  chargeAmount: number;
  chargeCurrency: string;
  rate: number;
  bearer: FeeBearer;
}): CollectionFees {
  const commission = Math.round(opts.ledgerAmount * opts.rate);

  if (opts.bearer === "CUSTOMER") {
    const customerFee = roundTo(opts.chargeAmount * opts.rate, opts.chargeCurrency);
    return {
      bearer: "CUSTOMER",
      commission,
      netAmount: opts.ledgerAmount,
      chargeTotal: roundTo(opts.chargeAmount + customerFee, opts.chargeCurrency),
      customerFee,
    };
  }

  return {
    bearer: "MERCHANT",
    commission,
    netAmount: opts.ledgerAmount - commission,
    chargeTotal: opts.chargeAmount,
    customerFee: 0,
  };
}
