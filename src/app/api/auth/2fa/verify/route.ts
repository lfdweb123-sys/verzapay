import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifySecret } from "@/lib/crypto-utils";
import { twoFactorVerifySchema, parseOrThrow } from "@/lib/validation";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, code } = parseOrThrow(twoFactorVerifySchema, raw);

    const db = adminDb();
    const codeRef = db.collection("twoFactorCodes").doc(uid);
    const snap = await codeRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Aucun code en attente. Redemandez un code." }, { status: 404 });
    }

    const data = snap.data()!;

    if (Date.now() > data.expiresAt) {
      await codeRef.delete();
      return NextResponse.json({ error: "Code expiré. Redemandez un code." }, { status: 410 });
    }

    if (data.attempts >= MAX_ATTEMPTS) {
      await codeRef.delete();
      return NextResponse.json({ error: "Trop de tentatives. Redemandez un code." }, { status: 429 });
    }

    const valid = verifySecret(code, data.codeHash);

    if (!valid) {
      await codeRef.update({ attempts: data.attempts + 1 });
      return NextResponse.json({ error: "Code incorrect" }, { status: 401 });
    }

    await codeRef.delete();

    // Preuve de réception de l'email : posée côté serveur uniquement
    // (les règles Firestore interdisent au client d'écrire ce champ).
    await db.collection("users").doc(uid).set(
      { emailCodeVerified: true, emailCodeVerifiedAt: Date.now(), verifyRequestedAt: null, verifyDeadline: null },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/2fa/verify:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
