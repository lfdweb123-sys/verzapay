import crypto from "crypto";

/**
 * Hash une valeur (code 2FA ou clé API secrète) avec scrypt + sel aléatoire.
 * Format de retour : "salt:hash" (hex)
 */
export function hashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifySecret(value: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(value, salt, 64).toString("hex");
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Génère un code numérique à 6 chiffres pour la 2FA */
export function generateSixDigitCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/** Génère une clé API secrète Verzapay (préfixe + valeur aléatoire) */
export function generateApiSecretKey(): string {
  const bytes = crypto.randomBytes(32).toString("hex");
  return `vpz_sk_${bytes}`;
}

export function generateApiPublicKey(): string {
  const bytes = crypto.randomBytes(16).toString("hex");
  return `vpz_pk_${bytes}`;
}
