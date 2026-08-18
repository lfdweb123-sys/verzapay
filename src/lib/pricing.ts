/**
 * Grille tarifaire publique Verzapay.
 *
 * Les taux ci-dessous reflètent le coût total facturé au marchand par
 * Verzapay (commission Verzapay incluse), jamais le nom d'un quelconque
 * partenaire technique sous-jacent — ce fichier ne doit JAMAIS mentionner
 * un nom de partenaire de paiement, uniquement "Verzapay".
 */

export const VERZAPAY_COMMISSION_RATE = 0.005; // 0.5% — taux Verzapay affiché dans l'app (companies.commissionRate par défaut)

export interface MobileMoneyRate {
  country: string;
  operator: string;
  payIn: string; // encaissement
  payOut: string; // décaissement
}

export const MOBILE_MONEY_RATES: MobileMoneyRate[] = [
  { country: "Côte d'Ivoire", operator: "MTN MoMo", payIn: "2.5%", payOut: "1.5%" },
  { country: "Côte d'Ivoire", operator: "Orange Money", payIn: "2.5%", payOut: "1.5%" },
  { country: "Côte d'Ivoire", operator: "Wave", payIn: "2.5%", payOut: "2%" },
  { country: "Côte d'Ivoire", operator: "Moov Money", payIn: "2.5%", payOut: "1.5%" },
  { country: "Bénin", operator: "MTN MoMo", payIn: "2.75%", payOut: "2.00%" },
  { country: "Bénin", operator: "Moov Africa", payIn: "2.75%", payOut: "1.5%" },
  { country: "Sénégal", operator: "Free Money", payIn: "2.50%", payOut: "2%" },
  { country: "Sénégal", operator: "Orange Money", payIn: "2.50%", payOut: "2.3%" },
  { country: "Sénégal", operator: "Wave", payIn: "2.5%", payOut: "2%" },
  { country: "Cameroun", operator: "MTN MoMo", payIn: "2.25%", payOut: "1.5%" },
  { country: "Cameroun", operator: "Orange Money", payIn: "2.25%", payOut: "1.5%" },
  { country: "Congo-Brazzaville", operator: "Airtel Money", payIn: "4.5%", payOut: "1.5%" },
  { country: "Congo-Brazzaville", operator: "MTN MoMo", payIn: "4.5%", payOut: "1.5%" },
  { country: "Gabon", operator: "Airtel Money", payIn: "2.5%", payOut: "1.5%" },
  { country: "Rwanda", operator: "MTN MoMo", payIn: "3.6%", payOut: "1.5%" },
  { country: "Rwanda", operator: "Airtel Money", payIn: "3%", payOut: "1.5%" },
  { country: "Ouganda", operator: "MTN MoMo", payIn: "3.5%", payOut: "1.5%" },
  { country: "Ouganda", operator: "Airtel Money", payIn: "3%", payOut: "1.5%" },
  { country: "RDC (CDF)", operator: "Airtel Money", payIn: "3.5%", payOut: "2.5%" },
  { country: "RDC (CDF)", operator: "Orange Money", payIn: "3.5%", payOut: "1.5%" },
  { country: "RDC (USD)", operator: "Airtel Money", payIn: "3.5%", payOut: "2.5%" },
  { country: "RDC (USD)", operator: "Orange Money", payIn: "3.5%", payOut: "1.5%" },
  { country: "Sierra Leone", operator: "Orange Money", payIn: "3.8%", payOut: "2.75%" },
];

export interface CashWithdrawalRate {
  country: string;
  fee: string;
}

export const CASH_WITHDRAWAL_RATES: CashWithdrawalRate[] = [
  { country: "Bénin", fee: "1.5%" },
  { country: "Burkina Faso", fee: "1.5%" },
  { country: "Côte d'Ivoire", fee: "1.5%" },
  { country: "Cameroun", fee: "1.5%" },
  { country: "Mali", fee: "1.5%" },
  { country: "Sénégal", fee: "1.5%" },
  { country: "Togo", fee: "1.5%" },
  { country: "Guinée Conakry", fee: "1.3%" },
];

export const BANK_PAYOUT_FEES = [
  { zone: "Banques zone UEMOA", fee: "1 500 XOF" },
  { zone: "Banques zone CEMAC", fee: "2 500 XAF" },
  { zone: "Banques Nigeria / Ghana / Ouganda", fee: "1 USD" },
];

export const CARD_PROCESSING_FEE = "5%";
export const SETTLEMENT_DELAY = "Sous 2 jours ouvrés (XOF), jusqu'à 5 jours pour les autres devises";
