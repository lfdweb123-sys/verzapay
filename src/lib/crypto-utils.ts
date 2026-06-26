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
    return false;import crypto from "crypto";

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

/**
 * Hash déterministe (SHA-256, pas de sel) utilisé UNIQUEMENT comme clé de
 * recherche Firestore pour retrouver quelle entreprise possède une clé API
 * secrète donnée — jamais comme preuve d'authentification en soi.
 *
 * Pourquoi : hashSecret() ci-dessus est volontairement salé aléatoirement,
 * donc deux hash de la même valeur ne sont jamais égaux -> impossible à
 * indexer/chercher directement dans Firestore (`where("apiKeySecretHash", "==", ...)`
 * ne matchera jamais). Pour authentifier une requête API publique sans
 * scanner toutes les entreprises de la base à chaque appel, on a besoin d'un
 * identifiant de recherche stable.
 *
 * Sécurité : un hash SHA-256 non salé d'une valeur à haute entropie (32
 * octets aléatoires, cf generateApiSecretKey) reste impraticable à inverser
 * par force brute ou par table arc-en-ciel. Il sert seulement à localiser le
 * document ; la vérification d'authenticité finale repasse toujours par
 * verifySecret() contre apiKeySecretHash (scrypt salé) avant d'accorder l'accès.
 */
export function hashLookup(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
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
