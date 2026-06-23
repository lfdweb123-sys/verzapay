export type KycStatus = "not_started" | "awaiting_submission" | "pending" | "review" | "approved" | "rejected";

export type PaymentMethod = "mobile_money" | "card" | "wave";

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
  transactionTwoFactorEnabled?: boolean; // true par défaut — code 6 chiffres requis pour chaque retrait/paiement envoyé
  pendingEmail?: string | null; // demande de changement d'email en attente de validation admin
  pendingEmailRequestedAt?: number | null;
}

export interface Company {
  id: string;
  name: string;
  legalName?: string;
  sector?: string;
  country: string;
  ownerUid: string;
  members: string[]; // uids
  role?: "Root" | "Admin" | "Membre";
  createdAt: number;
  kycStatus: KycStatus;
  kycVerificationId?: string | null;
  kycSessionId?: string | null;
  kycRiskLevel?: "low" | "medium" | "high" | null;
  kycReviewedAt?: number | null;
  commissionRate: number; // ex 0.015 = 1.5%
  joonapayClientKey?: string | null; // chiffré côté serveur uniquement, jamais exposé tel quel au client
  joonapayConfigured?: boolean;
  apiKeyPublic?: string; // identifiant public, toujours visible (ex: vpz_pk_xxx)
  apiKeySecretHash?: string; // hash bcrypt de la clé secrète, jamais la valeur en clair
  apiKeySecretGenerated?: boolean; // true dès qu'une clé secrète a été générée au moins une fois
  apiKeySecretLastFour?: string; // 4 derniers caractères, pour affichage type "vpz_sk_...a93f"
  apiKeySecretCreatedAt?: number | null;
  logoColor?: string; // couleur générée pour l'avatar
  walletBalance: number; // solde net disponible pour ce marchand (ledger interne)
  suspended?: boolean; // si true, paiements/retraits bloqués côté serveur (désactivé par l'admin)
  suspendedAt?: number | null;
  suspendedReason?: string | null;

  // Informations légales de l'entreprise (IFU / RCCM)
  legalInfo?: {
    ifuNumber?: string;
    rccmNumber?: string;
    legalCategory?: string;
    taxRegime?: string;
    address?: string;
    ownerFullName?: string;
    activityDescription?: string;
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
  status: PayoutStatus;
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
