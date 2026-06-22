import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createVerifyProSession } from "@/lib/verifypro";
import { notifyAdmin } from "@/lib/notify-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { companyId, uid, email, displayName } = await req.json();

    if (!companyId || typeof companyId !== "string" || !uid || typeof uid !== "string") {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const limited = await checkRateLimit(`kyc-session:uid:${uid}`, 10, 3600); // 10 tentatives / heure
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    }

    const company = companySnap.data()!;
    // Vérif que l'utilisateur est bien membre
    if (!company.members?.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const session = await createVerifyProSession({
      type: "full-kyc",
      documentType: "national_id",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/kyc-pending?companyId=${companyId}&status=done`,
      expiresInMinutes: 60,
      prefill: {
        email: email ?? undefined,
        firstName: displayName?.split(" ")[0] ?? undefined,
        lastName: displayName?.split(" ").slice(1).join(" ") ?? undefined,
      },
      metadata: { companyId, uid },
    });

    // Le statut passe à "awaiting_submission" (lien généré, en attente que
    // le marchand soumette réellement ses documents) — PAS "pending", qui
    // signifie "documents soumis, analyse en cours". La transition vers
    // "pending" n'a lieu que lorsque le webhook VerifyPro confirme une
    // soumission réelle (voir /api/webhooks/verifypro).
    await db.collection("companies").doc(companyId).update({
      kycStatus: "awaiting_submission",
      kycSessionId: session.sessionId,
    });

    await notifyAdmin({
      title: "Nouvelle demande de vérification KYC",
      body: `L'entreprise <strong>${company.name}</strong> (${company.country}) a démarré sa vérification d'identité.`,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    });

    return NextResponse.json({
      sessionId: session.sessionId,
      verificationUrl: session.verificationUrl,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    console.error("POST /api/verifypro/session:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
