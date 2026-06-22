import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { requireAdmin } from "@/lib/require-admin";
import { kycReviewSchema, parseOrThrow } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { adminUid, companyId, decision } = parseOrThrow(kycReviewSchema, raw);

    const isAdmin = await requireAdmin(adminUid);
    if (!isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;
    await companyRef.update({ kycStatus: decision, kycReviewedAt: Date.now() });

    const title = decision === "approved" ? "KYC approuvé 🎉" : "KYC rejeté";
    const body = decision === "approved"
      ? "Votre entreprise est maintenant vérifiée. Les paiements sont activés."
      : "Votre dossier KYC a été rejeté après examen. Vous pouvez recommencer la vérification.";

    await sendPushAndStore({
      uid: company.ownerUid,
      companyId,
      title,
      body,
      type: "kyc",
      link: `/kyc-pending?companyId=${companyId}`,
    });

    const ownerSnap = await db.collection("users").doc(company.ownerUid).get();
    const ownerEmail = ownerSnap.data()?.email;
    if (ownerEmail) {
      await sendTransactionalEmail({
        to: [{ email: ownerEmail, name: ownerSnap.data()?.displayName }],
        subject: title,
        htmlContent: emailTemplate({
          title,
          body,
          ctaLabel: "Voir le tableau de bord",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/kyc-review:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
