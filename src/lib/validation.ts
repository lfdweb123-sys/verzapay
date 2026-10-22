import { z } from "zod";

// ─── Primitives réutilisables ──────────────────────────────────────────────
const uid = z.string().min(1).max(128);
const companyId = z.string().min(1).max(128);
const email = z.string().email().max(254);
const phone = z.string().min(6).max(30).optional().nullable();
const shortText = (max: number) => z.string().max(max).optional().nullable();
const base64Image = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,/, "Format d'image invalide")
  .max(700_000) // marge pour l'encodage base64 d'une image de 500 Ko
  .optional()
  .nullable();

// Document RCCM (PDF uniquement) en base64. Limite à ~500 Ko en base64
// (≈ 370 Ko de PDF réel après décodage) : un RCCM scanné correctement
// compressé tient largement dans cette limite, ce qui évite de stocker des
// documents lourds directement dans un champ Firestore (limite de 1 Mo par
// document Firestore tous champs confondus — il faut garder de la marge
// pour le reste de legalInfo et de Company).
const base64Pdf = z
  .string()
  .regex(/^data:application\/pdf;base64,/, "Le fichier doit être un PDF")
  .max(500_000, "Le PDF est trop lourd (max ~370 Ko). Compressez-le avant l'envoi.")
  .optional()
  .nullable();

// ─── Auth / 2FA ─────────────────────────────────────────────────────────────
export const twoFactorSendSchema = z.object({
  uid,
  email,
  displayName: shortText(150),
});

export const twoFactorVerifySchema = z.object({
  uid,
  code: z.string().regex(/^\d{6}$/, "Le code doit contenir exactement 6 chiffres"),
});

// ─── Paiements ──────────────────────────────────────────────────────────────
export const createPaymentSchema = z.object({
  companyId,
  amount: z.coerce.number().finite().min(100).max(50_000_000),
  currency: z.literal("XOF").optional(),
  description: shortText(200),
  customerName: shortText(100),
  customerPhone: z.string().min(6, "Le numéro de téléphone du client est requis").max(30),
  customerEmail: z.string().email().max(150).optional().nullable(),
  imageBase64: base64Image,
  feeBearer: z.enum(["MERCHANT", "CUSTOMER"]).optional().nullable(),
  uid,
  // Méthode de paiement souhaitée par le marchand.
  // "ANY" (ou absent) = pas de méthode imposée : JoonaPay affichera toutes
  // les méthodes actives pour le pays du client sur sa page de paiement,
  // et c'est le client qui choisit. Sinon, verrouille un canal précis.
  channel: z.enum(["ANY", "MOBILE_MONEY", "CREDIT_CARD", "BANK_TRANSFER"]).optional().nullable(),
});

export const createPayoutSchema = z.object({
  companyId,
  amount: z.coerce.number().finite().min(500).max(50_000_000),
  currency: z.literal("XOF").optional(),
  recipientPhone: z.string().min(6).max(30),
  recipientName: shortText(100),
  // Code de l'opérateur mobile money choisi par l'utilisateur côté front
  // (ex: "MTN_MONEY", "ORANGE_CI") quand plusieurs opérateurs sont actifs
  // pour le pays résolu et qu'on ne peut pas en déduire un seul automatiquement.
  // Optionnel : si absent, resolvePaymentMethod retombe sur sa propre logique
  // de résolution (ou retourne "ambiguous" si plusieurs opérateurs collent).
  recipientOperator: shortText(60),
  // Mode de décaissement : mobile money (défaut) ou virement bancaire.
  method: z.enum(["mobile_money", "bank_transfer"]).optional(),
  bank: z
    .object({
      bankName: z.string().min(2).max(120),
      accountHolderName: z.string().min(2).max(120),
      iban: z.string().max(40).optional().nullable(),
      bicSwift: z.string().max(20).optional().nullable(),
      accountNumber: z.string().max(40).optional().nullable(),
      sortCode: z.string().max(20).optional().nullable(),
      routingNumber: z.string().max(20).optional().nullable(),
    })
    .optional()
    .nullable(),
  note: shortText(200),
  uid,
});

// ─── Entreprises ────────────────────────────────────────────────────────────
export const createCompanySchema = z.object({
  uid,
  name: z.string().min(2).max(120),
  legalName: shortText(150),
  sector: shortText(60),
  country: z.string().length(2),
});

// Infos légales : tous les champs restent optionnels. C'est volontaire et
// structurel — un marchand "particulier" soumet ce formulaire vide (ou ne
// le soumet jamais), un marchand "entreprise" le remplit. L'absence de
// ifuNumber/rccmNumber est ce qui permet de distinguer les deux profils
// sans champ booléen dédié (cf Company.legalInfo dans types/index.ts).
export const companyLegalInfoSchema = z.object({
  ifuNumber: shortText(50),
  rccmNumber: shortText(80),
  legalCategory: shortText(120),
  taxRegime: shortText(120),
  ownerFullName: shortText(150),
  address: shortText(300),
  activityDescription: shortText(500),
  rccmDocumentBase64: base64Pdf,
});

// ─── Clé API ────────────────────────────────────────────────────────────────
export const generateApiKeySchema = z.object({
  companyId,
  uid,
});

// ─── Équipe ─────────────────────────────────────────────────────────────────
export const teamInviteSchema = z.object({
  companyId,
  uid,
  email,
  role: z.enum(["Admin", "Membre"]),
});

export const teamRespondSchema = z.object({
  companyId,
  inviteId: z.string().min(1).max(128),
  token: z.string().min(10).max(200),
  uid,
  action: z.enum(["accept", "decline"]),
});

// ─── Contact / Support ──────────────────────────────────────────────────────
export const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email,
  subject: shortText(200),
  message: z.string().min(1).max(3000),
  source: z.enum(["contact", "support"]),
  uid: z.string().max(128).optional().nullable(),
  companyId: z.string().max(128).optional().nullable(),
});

// ─── Admin ──────────────────────────────────────────────────────────────────
export const kycReviewSchema = z.object({
  adminUid: uid,
  companyId,
  decision: z.enum(["approved", "rejected"]),
});

export const suspendCompanySchema = z.object({
  adminUid: uid,
  companyId,
  suspended: z.boolean(),
  reason: shortText(300),
});

export const changeMerchantEmailSchema = z.object({
  adminUid: uid,
  targetUid: uid,
  newEmail: email,
});

export const requestEmailChangeSchema = z.object({
  uid,
  newEmail: email,
});

export const adminSendMessageSchema = z.object({
  adminUid: uid,
  target: z.enum(["single", "all", "unverified"]),
  targetUid: z.string().max(128).optional().nullable(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  sendEmail: z.boolean(),
  sendPush: z.boolean(),
});

// ─── Boutique ───────────────────────────────────────────────────────────────
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createShopSchema = z.object({
  uid,
  companyId,
  name: z.string().min(2).max(80),
  slug: z.string().min(3).max(40).regex(slugPattern, "Le lien ne peut contenir que des lettres minuscules, chiffres et tirets"),
  description: shortText(500),
  whatsappNumber: shortText(30),
});

export const updateShopSchema = z.object({
  uid,
  shopId: z.string().min(1).max(128),
  name: z.string().min(2).max(80).optional(),
  description: shortText(500),
  whatsappNumber: shortText(30),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  logoBase64: base64Image,
  coverBase64: base64Image,
  isActive: z.boolean().optional(),
});

export const createProductSchema = z.object({
  uid,
  shopId: z.string().min(1).max(128),
  name: z.string().min(1).max(120),
  description: shortText(1000),
  price: z.coerce.number().finite().positive().max(50_000_000),
  imageBase64: base64Image,
  stock: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
});

export const updateProductSchema = z.object({
  uid,
  productId: z.string().min(1).max(128),
  name: z.string().min(1).max(120).optional(),
  description: shortText(1000),
  price: z.coerce.number().finite().positive().max(50_000_000).optional(),
  imageBase64: base64Image,
  stock: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createShopOrderSchema = z.object({
  shopSlug: z.string().min(1).max(40),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(1000),
  })).min(1).max(50),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().min(6).max(30),
  customerEmail: z.string().email().max(150).optional().nullable(),
  customerAddress: shortText(300),
});

/**
 * Parse et valide un body de requête avec un schéma Zod. Lève une erreur
 * normalisée (message lisible) en cas d'échec, à capter dans le try/catch
 * de la route appelante.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path?.join(".") || "valeur";
    throw new Error(`Donnée invalide (${path}): ${firstIssue?.message ?? "format incorrect"}`);
  }
  return result.data;
}