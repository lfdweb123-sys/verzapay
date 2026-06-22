import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import crypto from "crypto";

function verifySignature(payload: string, header: string, secret: string): boolean {
  try {
    const parts = header.split(",");
    const tsPart = parts.find((p) => p.startsWith("t="));
    const sigPart = parts.find((p) => p.startsWith("v1="));
    if (!tsPart || !sigPart) return false;
    const timestamp = tsPart.replace("t=", "");
    const signature = sigPart.replace("v1=", "");
    const signed = `${timestamp}.${payload}`;
    const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-verifypro-signature") ?? "";
  const secret = process.env.VERIFYPRO_WEBHOOK_SECRET ?? "";

  if (secret && !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const db = adminDb();

  // L'utilisateur a ouvert/vu la page de vérification — le lien a été cliqué,
  // mais aucun document n'a forcément été soumis encore. On reste en
  // "awaiting_submission" tant qu'on n'a pas confirmation qu'un document a
  // été envoyé pour analyse.
  if (event.event === "session.created" || event.event === "session.viewed") {
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    if (metadata.companyId) {
      const companySnap = await db.collection("companies").doc(metadata.companyId).get();
      // Ne touche au statut que s'il est encore à "awaiting_submission" pour
      // éviter d'écraser un statut plus avancé (pending/approved/rejected)
      // en cas de webhook reçu hors ordre.
      if (companySnap.exists && companySnap.data()?.kycStatus === "awaiting_submission") {
        await db.collection("companies").doc(metadata.companyId).update({ kycStatus: "awaiting_submission" });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Documents réellement soumis, analyse démarrée côté VerifyPro
  if (event.event === "verification.started" || event.event === "document.submitted") {
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    if (metadata.companyId) {
      await db.collection("companies").doc(metadata.companyId).update({ kycStatus: "pending" });
    }
    return NextResponse.json({ ok: true });
  }

  if (event.event === "verification.completed") {
    const verificationId: string = event.data?.id;
    const riskLevel: string = event.data?.riskLevel ?? "medium";
    const fraudDetected: boolean = event.data?.fraudDetected ?? false;
    const metadata: { companyId?: string; uid?: string } = event.data?.metadata ?? {};

    if (!metadata.companyId) return NextResponse.json({ ok: true });

    const newStatus = fraudDetected || riskLevel === "high"
      ? "review"
      : riskLevel === "low"
      ? "approved"
      : "review";

    await db.collection("companies").doc(metadata.companyId).update({
      kycStatus: newStatus,
      kycVerificationId: verificationId,
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
    });

    // Notification push + email
    if (metadata.uid) {
      const title = newStatus === "approved" ? "KYC approuvé 🎉" : "KYC en révision";
      const body = newStatus === "approved"
        ? "Votre entreprise est maintenant vérifiée. Les paiements sont activés."
        : "Votre dossier KYC est en cours de révision manuelle. Vous serez notifié sous 24h.";

      await sendPushAndStore({
        uid: metadata.uid,
        companyId: metadata.companyId,
        title,
        body,
        type: "kyc",
        link: `/kyc-pending?companyId=${metadata.companyId}`,
      });

      const userSnap = await db.collection("users").doc(metadata.uid).get();
      const userEmail = userSnap.data()?.email;
      if (userEmail) {
        await sendTransactionalEmail({
          to: [{ email: userEmail, name: userSnap.data()?.displayName }],
          subject: title,
          htmlContent: emailTemplate({
            title,
            body,
            ctaLabel: "Accéder au tableau de bord",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          }),
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
