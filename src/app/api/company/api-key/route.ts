import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashSecret, hashLookup, generateApiSecretKey, generateApiPublicKey } from "@/lib/crypto-utils";
import { generateApiKeySchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { companyId, uid } = parseOrThrow(generateApiKeySchema, raw);

    const limited = await checkRateLimit(`api-key-gen:uid:${uid}`, 10, 3600); // 10 générations / heure max
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;
    if (company.ownerUid !== uid) {
      return NextResponse.json({ error: "Seul le propriétaire peut générer une clé API" }, { status: 403 });
    }

    const secretKey = generateApiSecretKey();
    const publicKey = company.apiKeyPublic || generateApiPublicKey();
    const secretHash = hashSecret(secretKey);
    // Hash de recherche déterministe (non salé) — sert uniquement à localiser
    // ce document via une requête Firestore indexée dans /api/v1/*. La preuve
    // d'authenticité reste apiKeySecretHash (scrypt salé), vérifié séparément.
    const secretLookupHash = hashLookup(secretKey);
    const lastFour = secretKey.slice(-4);

    await companyRef.update({
      apiKeyPublic: publicKey,
      apiKeySecretHash: secretHash,
      apiKeySecretLookupHash: secretLookupHash,
      apiKeySecretGenerated: true,
      apiKeySecretLastFour: lastFour,
      apiKeySecretCreatedAt: Date.now(),
    });

    // La clé secrète en clair n'est RETOURNÉE qu'une seule fois ici, jamais stockée en clair, jamais re-servie.
    return NextResponse.json({ publicKey, secretKey });
  } catch (err) {
    console.error("POST /api/company/api-key:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}