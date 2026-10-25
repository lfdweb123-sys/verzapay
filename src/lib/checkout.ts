import crypto from "crypto";

// Logique pure du checkout hébergé (testable sans réseau).

export type CheckoutState = "pending" | "success" | "failed" | "cancelled" | "expired";

export interface MethodLike {
  uuid: string;
  name: string;
  code: string;
  channel: string;
  payment_status: string;
  country: { code: string };
}

export const SESSION_TTL_MS = 48 * 60 * 60 * 1000; // 48 h
export const ATTEMPT_LOCK_MS = 5 * 60 * 1000;      // une tentative Mobile Money en cours bloque les doubles débits

/** Jeton opaque, non devinable (aucun identifiant interne dans l'URL). */
export function newCheckoutToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function isValidTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{24,64}$/.test(token);
}

/** Méthodes réellement disponibles pour un pays, regroupées par type. */
export function groupMethods(methods: MethodLike[], countryCode: string) {
  const active = methods.filter((m) => m.country.code === countryCode && m.payment_status === "active");
  return {
    mobileMoney: active.filter((m) => m.channel === "MOBILE_MONEY").map((m) => ({ code: m.code, name: m.name })),
    card: active.some((m) => m.channel === "CREDIT_CARD"),
    bank: active.some((m) => m.channel === "BANK_TRANSFER"),
  };
}

/** Numéro E.164 : "+" gardé tel quel, sinon indicatif + chiffres saisis (zéros initiaux conservés : formats 10 chiffres). */
export function toE164(indicator: string, input: string): string | null {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const ind = indicator.startsWith("+") ? indicator : `+${indicator}`;
  const e164 = raw.startsWith("+") ? `+${digits}` : raw.startsWith("00") ? `+${digits.slice(2)}` : `${ind}${digits}`;
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}

/** Une tentative Mobile Money récente (initiée ou en attente) bloque toute nouvelle tentative. */
export function isAttemptLocked(
  attempt: { status: string; at: number } | null | undefined,
  now: number
): boolean {
  return !!attempt && (attempt.status === "initiating" || attempt.status === "pending") && now - attempt.at < ATTEMPT_LOCK_MS;
}

export const FAILURE_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Le solde du compte est insuffisant.",
  INVALID_PIN: "Le code secret saisi est incorrect.",
  INVALID_ACCOUNT: "Ce numéro n'est pas valide pour ce moyen de paiement.",
  NETWORK_ERROR: "Problème de réseau avec l'opérateur. Réessayez.",
  TRANSACTION_TIMEOUT: "La confirmation a pris trop de temps. Réessayez.",
  DAILY_LIMIT_EXCEEDED: "La limite quotidienne de l'opérateur est atteinte.",
  SERVICE_UNAVAILABLE: "Le service de l'opérateur est momentanément indisponible.",
  CANCELLED_BY_USER: "Le paiement a été annulé.",
  DUPLICATE_TRANSACTION: "Une transaction identique existe déjà.",
};

interface PaymentDetailLike {
  status?: string;
  payment_status?: string;
  payments?: { status?: string; failure_reason?: string | null }[];
}

/**
 * État fiable d'un paiement d'après le détail renvoyé par le partenaire (appel serveur).
 * Seuls PAID / OVERPAID (ou status SUCCESS) valent "payé" — jamais une simple redirection.
 */
export function mapPaymentState(detail: PaymentDetailLike): { state: CheckoutState; message?: string; canRetry: boolean } {
  const status = String(detail.status ?? "").toUpperCase();
  const paymentStatus = String(detail.payment_status ?? "").toUpperCase();

  if (paymentStatus === "PAID" || paymentStatus === "OVERPAID" || status === "SUCCESS") {
    return { state: "success", canRetry: false };
  }
  if (status === "CANCELLED") return { state: "cancelled", message: "Ce paiement a été annulé.", canRetry: false };
  if (status === "EXPIRED") return { state: "expired", message: "Ce lien de paiement a expiré.", canRetry: false };

  const attempts = detail.payments ?? [];
  const last = attempts[attempts.length - 1];
  const lastStatus = String(last?.status ?? "").toUpperCase();

  if (status === "FAILED") {
    return { state: "failed", message: FAILURE_MESSAGES[String(last?.failure_reason ?? "")] ?? "Le paiement a échoué.", canRetry: false };
  }
  // Tentative échouée mais demande encore active : le client peut réessayer
  if (lastStatus === "FAILED") {
    return { state: "failed", message: FAILURE_MESSAGES[String(last?.failure_reason ?? "")] ?? "Le paiement a échoué. Vous pouvez réessayer.", canRetry: true };
  }
  return { state: "pending", canRetry: false };
}
