import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashSecret, generateSixDigitCode } from "@/lib/crypto-utils";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { twoFactorSendSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 secondes entre deux envois

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, email, displayName } = parseOrThrow(twoFactorSendSchema, raw);

    // Rate limit double : par compte (anti-spam ciblé) et par IP (anti-bot générique)
    const ip = getClientIp(req);
    const byUid = await checkRateLimit(`2fa-send:uid:${uid}`, 5, 600); // 5 envois / 10 min / compte
    if (!byUid.allowed) {
      return NextResponse.json({ error: "Trop de demandes. Réessayez dans quelques minutes." }, { status: 429 });
    }
    const byIp = await checkRateLimit(`2fa-send:ip:${ip}`, 20, 600); // 20 envois / 10 min / IP
    if (!byIp.allowed) {
      return NextResponse.json({ error: "Trop de demandes depuis votre réseau. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const codeRef = db.collection("twoFactorCodes").doc(uid);
    const existing = await codeRef.get();

    if (existing.exists) {
      const data = existing.data()!;
      if (Date.now() - data.createdAt < RESEND_COOLDOWN_MS) {
        return NextResponse.json({ error: "Veuillez patienter avant de redemander un code" }, { status: 429 });
      }
    }

    const code = generateSixDigitCode();
    const codeHash = hashSecret(code);

    await codeRef.set({
      uid,
      codeHash,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
      createdAt: Date.now(),
    });

    await sendTransactionalEmail({
      to: [{ email, name: displayName ?? undefined }],
      subject: `${code} — Votre code de connexion Verzapay`,
      htmlContent: emailTemplate({
        title: "Code de vérification",
        body: `Voici votre code de connexion à usage unique : <strong style="font-size:24px; letter-spacing:4px;">${code}</strong><br/><br/>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
      }),
    });

    return NextResponse.json({ ok: true, expiresInSeconds: CODE_TTL_MS / 1000 });
  } catch (err) {
    console.error("POST /api/auth/2fa/send:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
