import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashLookup, verifySecret } from "@/lib/crypto-utils";
import type { Company } from "@/types";

export interface ApiAuthResult {
  company: Company;
}

export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Authentifie une requête publique (/api/v1/*) à partir du header
 * "Authorization: Bearer vpz_sk_...". Lève une ApiAuthError (401/403) si
 * la clé est absente, malformée, inconnue, ou si l'entreprise associée
 * n'est pas en état d'opérer (KYC non approuvé, suspendue).
 *
 * Lookup en deux temps, volontairement :
 *  1. hashLookup() (SHA-256 déterministe) -> requête Firestore indexée pour
 *     retrouver LE document candidat sans scanner toute la collection.
 *  2. verifySecret() (scrypt salé, déjà utilisé pour les clés API et la 2FA)
 *     -> seule cette étape constitue la preuve d'authenticité réelle.
 * Si l'étape 1 ne retrouve rien, ou si l'étape 2 échoue, le résultat est
 * identique (401 générique) : on ne donne aucun indice permettant de
 * distinguer "clé inconnue" de "clé connue mais invalide".
 */
export async function authenticateApiRequest(req: NextRequest): Promise<ApiAuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiAuthError("En-tête Authorization manquant ou invalide. Format attendu : Bearer vpz_sk_...", 401);
  }

  const secretKey = authHeader.slice("Bearer ".length).trim();
  if (!secretKey.startsWith("vpz_sk_")) {
    throw new ApiAuthError("Clé API invalide", 401);
  }

  const db = adminDb();
  const lookupHash = hashLookup(secretKey);

  const snap = await db
    .collection("companies")
    .where("apiKeySecretLookupHash", "==", lookupHash)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new ApiAuthError("Clé API invalide", 401);
  }

  const companyDoc = snap.docs[0];
  const company = { id: companyDoc.id, ...companyDoc.data() } as Company & {
    apiKeySecretHash?: string;
  };

  if (!company.apiKeySecretHash || !verifySecret(secretKey, company.apiKeySecretHash)) {
    throw new ApiAuthError("Clé API invalide", 401);
  }

  if (company.suspended === true) {
    throw new ApiAuthError("Ce compte marchand est actuellement suspendu. Contactez le support.", 403);
  }
  if (company.kycStatus !== "approved") {
    throw new ApiAuthError("KYC non approuvé pour cette entreprise. L'API n'est disponible qu'après approbation.", 403);
  }

  return { company };
}