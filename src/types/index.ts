export type KycStatus = "not_started" | "awaiting_submission" | "pending" | "review" | "approved" | "rejected";

// "bank_transfer" : nécessaire pour distinguer les paiements par virement
// bancaire de ceux par carte une fois CREDIT_CARD/BANK_TRANSFER activés côté
// JoonaPay. "wave" est laissé tel quel, inchangé.
export type PaymentMethod = "mobile_money" | "card" | "bank_transfer" | "wave";

export type TransactionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type PayoutStatus = "pending" | "processing" | "completed" | "failed" | "rejected";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  phone?: string | null;
  photoURL?: string | null;
  createdAt: number;
  activeCompanyId?: string | null;
  fcmTokens?: string[];
  isAdmin?: boolean;
  theme?: "light" | "dark"; // préférence d'affichage côté client
  twoFactorEnabled?: boolean;
  // Posé UNIQUEMENT par le serveur après saisie correcte du code à 6 chiffres (règles Firestore : non modifiable côté client)
  emailCodeVerified?: boolean;
  transactionTwoFactorEnabled?: boolean; // true par défaut — code 6 chiffres requis pour chaque retrait/paiement envoyé
  pendingEmail?: string | null; // demande de changement d'email en attente de validation admin
  pendingEmailRequestedAt?: number | null;
}

/**
 * Données extraites automatiquement par VerifyPro lors de
 * verification.manual_review / verification.completed (OCR + face match +
 * AML). Remplies UNIQUEMENT par le webhook /api/webhooks/verifypro, jamais
 * saisies manuellement par le marchand — ce sont des données d'identité
 * vérifiées par le prestataire KYC, pas des déclarations spontanées.
 * Tous les champs sont optionnels : un même Company peut avoir 0, 1 ou
 * plusieurs cycles KYC dans le temps, et certains événements n'apportent
 * que des sous-ensembles (ex: faceMatch sans amlResult selon le flux).
 */
export interface KycExtractedData {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null; // format tel que reçu du prestataire, ex: "30/09/1988"
  docNumber?: string | null;
  expiryDate?: string | null;
  nationality?: string | null; // code ISO 3166-1 alpha-3, ex: "TGO"
  address?: string | null;
  documentExpired?: boolean | null;
  tamperingDetected?: boolean | null; // falsification détectée sur le document
  confidenceScore?: number | null; // score de confiance OCR, 0 à 1
  documentType?: string | null; // ex: "national_id"
  overallScore?: number | null; // score global de vérification (0-100)
  faceMatchScore?: number | null; // similarityScore du face match, 0 à 1
  faceMatchLivenessConfirmed?: boolean | null;
  faceMatchNeedsManualReview?: boolean | null;
  amlSanctionsMatch?: boolean | null;
  amlPepMatch?: boolean | null;
  amlRiskScore?: number | null;
  extractedAt?: number | null; // Date.now() au moment où le webhook a traité l'événement
}

export interface Company {
  id: string;
  name: string;
  legalName?: string;
  sector?: string;
  country: string;
  // Frais à charge : MERCHANT = le marchand / CUSTOMER = le client (encaissement) ou le bénéficiaire (décaissement)
  feesCollection?: "MERCHANT" | "CUSTOMER";
  feesPayout?: "MERCHANT" | "CUSTOMER";
  ownerUid: string;
  members: string[]; // uids
  role?: "Root" | "Admin" | "Membre";
  createdAt: number;
  kycStatus: KycStatus;
  kycVerificationId?: string | null;
  kycSessionId?: string | null;
  kycRiskLevel?: "low" | "medium" | "high" | null;
  kycReviewedAt?: number | null;
  // Données d'identité extraites automatiquement par le webhook KYC — voir
  // KycExtractedData ci-dessus. Présentes dès le premier événement
  // verification.manual_review ou verification.completed reçu pour cette
  // entreprise ; null/absent tant qu'aucune vérification n'a abouti.
  kycExtractedData?: KycExtractedData | null;
  commissionRate: number; // ex 0.005 = 0.5%
  joonapayClientKey?: string | null; // chiffré côté serveur uniquement, jamais exposé tel quel au client
  joonapayConfigured?: boolean;
  apiKeyPublic?: string; // identifiant public, toujours visible (ex: vpz_pk_xxx)
  apiKeySecretHash?: string; // hash scrypt salé de la clé secrète (lib/crypto-utils.ts), jamais la valeur en clair
  // Hash SHA-256 déterministe (non salé) de la clé secrète, utilisé UNIQUEMENT
  // pour la recherche Firestore dans /api/v1/* (cf lib/api-auth.ts). Ne sert
  // jamais seul à authentifier — toujours revérifié contre apiKeySecretHash.
  apiKeySecretLookupHash?: string;
  apiKeySecretGenerated?: boolean; // true dès qu'une clé secrète a été générée au moins une fois
  apiKeySecretLastFour?: string; // 4 derniers caractères, pour affichage type "vpz_sk_...a93f"
  apiKeySecretCreatedAt?: number | null;
  // URL configurée par le marchand pour recevoir les notifications d'événements
  // (paiement reçu/échoué, décaissement effectué/échoué). Verzapay reste
  // toujours l'unique destinataire des webhooks JoonaPay ; cette URL n'est
  // appelée qu'en relais, après traitement et vérification de signature.
  webhookUrl?: string | null;
  logoColor?: string; // couleur générée pour l'avatar
  walletBalance: number; // solde net disponible pour ce marchand (ledger interne)
  suspended?: boolean; // si true, paiements/retraits bloqués côté serveur (désactivé par l'admin)
  suspendedAt?: number | null;
  suspendedReason?: string | null;

  // Informations légales de l'entreprise (IFU / RCCM). Tous les champs sont
  // optionnels : un client "particulier" laisse ce bloc vide (ou absent) —
  // c'est précisément ce qui permet de distinguer particulier/entreprise
  // sans champ booléen dédié : legalInfo rempli => entreprise déclarée.
  legalInfo?: {
    ifuNumber?: string;
    rccmNumber?: string;
    legalCategory?: string;
    taxRegime?: string;
    address?: string;
    ownerFullName?: string;
    activityDescription?: string;
    // Registre de commerce (RCCM) numérisé, fourni par le marchand "entreprise".
    // Stocké en base64 directement dans Firestore (cohérent avec le reste du
    // système : imageBase64 sur Transaction/ShopProduct, etc.). Limité à
    // ~500 Ko en base64 (~370 Ko de PDF réel) côté validation — voir
    // rccmDocumentBase64 dans validation.ts.
    rccmDocumentBase64?: string | null;
    rccmDocumentUploadedAt?: number | null;
  };
}

export interface TeamMember {
  uid: string;
  email: string;
  displayName: string;
  role: "Root" | "Admin" | "Membre";
  invitedAt: number;
  status: "active" | "pending";
}

export interface TeamInvite {
  id: string;
  companyId: string;
  email: string;
  role: "Admin" | "Membre";
  invitedBy: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: number;
  token: string;
}

export interface Transaction {
  id: string;
  companyId: string;
  joonapayPaymentId?: string | null;
  amount: number;
  currency: string;
  commission: number;
  netAmount: number;
  method: PaymentMethod;
  status: TransactionStatus;
  description?: string;
  imageBase64?: string | null; // photo optionnelle du produit/service, max 500 Ko
  customerName?: string | null;
  customerPhone?: string | null;
  // Conversion de devise : `amount` reste en XOF (ledger). Le marchand a demandé requestedAmount requestedCurrency ;
  // le client est débité de chargeAmount chargeCurrency (devise du pays) au taux fxRate.
  requestedAmount?: number | null;
  requestedCurrency?: string | null;
  chargeAmount?: number | null;
  chargeCurrency?: string | null;
  fxRate?: number | null;
  customerEmail?: string | null;
  createdAt: number;
  completedAt?: number | null;
}

export interface Payout {
  id: string;
  companyId: string;
  joonapayPayoutId?: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  recipientPhone?: string | null;
  recipientName?: string | null;
  recipientBank?: string | null; // virement bancaire : nom de la banque
  recipientAccountLast4?: string | null; // virement bancaire : 4 derniers caractères du compte/IBAN
  status: PayoutStatus;
  // Conversion de devise : `amount` reste en XOF (ledger). Le marchand a demandé requestedAmount requestedCurrency ;
  // le bénéficiaire reçoit de chargeAmount chargeCurrency (devise du pays du bénéficiaire) au taux fxRate.
  requestedAmount?: number | null;
  requestedCurrency?: string | null;
  chargeAmount?: number | null;
  chargeCurrency?: string | null;
  fxRate?: number | null;
  requestedBy: string; // uid
  approvedBy?: string | null;
  createdAt: number;
  processedAt?: number | null;
  note?: string | null;
}

export interface LedgerEntry {
  id: string;
  companyId: string;
  type: "credit" | "debit";
  amount: number;
  balanceAfter: number;
  reference: string;
  relatedId?: string;
  createdAt: number;
  label: string;
}

export interface CustomerRecord {
  id: string;
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  totalSpent: number;
  transactionsCount: number;
  createdAt: number;
}

export interface NotificationItem {
  id: string;
  uid: string;
  companyId?: string;
  title: string;
  body: string;
  type: "payment" | "payout" | "kyc" | "system" | "team" | "admin";
  read: boolean;
  createdAt: number;
  link?: string;
}

export interface TwoFactorCode {
  uid: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  source: "contact" | "support";
  uid?: string | null;
  companyId?: string | null;
  createdAt: number;
}

// ─── Module Boutique ────────────────────────────────────────────────────────

export interface Shop {
  id: string;
  companyId: string; // entreprise Verzapay liée (clé API, KYC)
  ownerUid: string;
  slug: string; // identifiant unique dans l'URL publique : verzapay.app/shop/{slug}
  name: string;
  description?: string;
  logoBase64?: string | null;
  coverBase64?: string | null;
  primaryColor?: string; // couleur d'accent personnalisable
  whatsappNumber?: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ShopProduct {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  price: number; // XOF
  imageBase64?: string | null;
  stock: number | null; // null = stock illimité / non suivi
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ShopOrderStatus = "pending" | "paid" | "fulfilled" | "cancelled";

export interface ShopOrderItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface ShopOrder {
  id: string;
  shopId: string;
  companyId: string;
  items: ShopOrderItem[];
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerAddress?: string | null;
  status: ShopOrderStatus;
  joonapayPaymentId?: string | null;
  transactionId?: string | null; // référence vers companies/{id}/transactions/{txId}
  createdAt: number;
  paidAt?: number | null;
}