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
  console.log("🚀 [KYC] Webhook reçu !");
  
  const rawBody = await req.text();
  const signature = req.headers.get("x-verifypro-signature") ?? "";
  const secret = process.env.VERIFYPRO_WEBHOOK_SECRET ?? "";

  if (secret && !verifySignature(rawBody, signature, secret)) {
    console.log("❌ [KYC] Signature invalide");
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  console.log(`📊 [KYC] Événement reçu: ${event.event}`);
  
  const db = adminDb();

  // 🔥 NOUVEAU: Gestion de verification.manual_review
  if (event.event === "verification.manual_review") {
    console.log("🔄 [KYC] Vérification en révision manuelle !");
    
    const data = event.data;
    const metadata: { companyId?: string; uid?: string } = data?.metadata ?? {};
    const riskLevel = data?.riskLevel ?? "medium";
    const fraudDetected = data?.fraudDetected ?? false;
    
    console.log(`📊 [KYC] Niveau de risque: ${riskLevel}`);
    console.log(`📊 [KYC] Fraude détectée: ${fraudDetected}`);
    console.log(`📊 [KYC] Métadonnées:`, metadata);

    if (!metadata.companyId) {
      console.log("⚠️ [KYC] Pas de companyId, impossible de continuer");
      return NextResponse.json({ ok: true });
    }

    // En révision manuelle, on met le statut à "review"
    console.log(`🏢 [KYC] Mise à jour de l'entreprise ${metadata.companyId} vers "review"`);
    await db.collection("companies").doc(metadata.companyId).update({
      kycStatus: "review",
      kycVerificationId: data?.id || null,
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
    });
    console.log("✅ [KYC] Entreprise mise à jour: review");

    // Notification
    if (metadata.uid) {
      console.log(`📧 [KYC] Envoi des notifications pour l'utilisateur ${metadata.uid}`);
      
      const title = "KYC en révision manuelle ⏳";
      const body = "Votre dossier KYC est en cours de révision manuelle. Vous serez notifié sous 24h.";

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
    
    console.log("✅ [KYC] Traitement de verification.manual_review terminé");
    return NextResponse.json({ ok: true });
  }

  // L'utilisateur a ouvert/vu la page de vérification
  if (event.event === "session.created" || event.event === "session.viewed") {
    console.log(`👁️ [KYC] Session ${event.event} reçue`);
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    
    if (metadata.companyId) {
      const companySnap = await db.collection("companies").doc(metadata.companyId).get();
      if (companySnap.exists && companySnap.data()?.kycStatus === "awaiting_submission") {
        await db.collection("companies").doc(metadata.companyId).update({ kycStatus: "awaiting_submission" });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Documents soumis
  if (event.event === "verification.started" || event.event === "document.submitted") {
    console.log(`📄 [KYC] ${event.event} reçu - Documents soumis`);
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    
    if (metadata.companyId) {
      await db.collection("companies").doc(metadata.companyId).update({ kycStatus: "pending" });
    }
    return NextResponse.json({ ok: true });
  }

  // Vérification complétée
  if (event.event === "verification.completed") {
    console.log(`✅ [KYC] Vérification terminée !`);
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

  console.log("🏁 [KYC] Fin du traitement du webhook");
  return NextResponse.json({ ok: true });
}