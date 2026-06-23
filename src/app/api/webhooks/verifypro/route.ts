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
    const verificationId = data?.id;
    const riskLevel = data?.riskLevel ?? "medium";
    const fraudDetected = data?.fraudDetected ?? false;
    
    console.log(`📊 [KYC] ID de vérification: ${verificationId}`);
    console.log(`📊 [KYC] Niveau de risque: ${riskLevel}`);
    console.log(`📊 [KYC] Fraude détectée: ${fraudDetected}`);

    // 🔥 RÉCUPÉRER L'ENTREPRISE VIA L'ID DE VÉRIFICATION
    if (!verificationId) {
      console.log("❌ [KYC] Pas d'ID de vérification, impossible de continuer");
      return NextResponse.json({ ok: true });
    }

    // Chercher l'entreprise qui a ce kycVerificationId
    console.log(`🔍 [KYC] Recherche de l'entreprise avec kycVerificationId: ${verificationId}`);
    
    try {
      const companiesSnapshot = await db
        .collection("companies")
        .where("kycVerificationId", "==", verificationId)
        .get();

      if (companiesSnapshot.empty) {
        console.log(`❌ [KYC] Aucune entreprise trouvée avec kycVerificationId: ${verificationId}`);
        
        // 🔥 ALTERNATIVE: Chercher par sessionId si disponible
        const sessionId = data?.sessionId || data?.metadata?.sessionId;
        if (sessionId) {
          console.log(`🔍 [KYC] Recherche alternative par sessionId: ${sessionId}`);
          const sessionSnapshot = await db
            .collection("companies")
            .where("kycSessionId", "==", sessionId)
            .get();
          
          if (!sessionSnapshot.empty) {
            const doc = sessionSnapshot.docs[0];
            const companyId = doc.id;
            const companyData = doc.data();
            console.log(`✅ [KYC] Entreprise trouvée par sessionId: ${companyId}`);
            await updateCompanyKyc(db, companyId, companyData, verificationId, riskLevel, fraudDetected);
            return NextResponse.json({ ok: true });
          }
        }
        
        return NextResponse.json({ ok: true });
      }

      // Entreprise trouvée
      const doc = companiesSnapshot.docs[0];
      const companyId = doc.id;
      const companyData = doc.data();
      console.log(`✅ [KYC] Entreprise trouvée: ${companyId} (${companyData.name})`);
      
      await updateCompanyKyc(db, companyId, companyData, verificationId, riskLevel, fraudDetected);
      
    } catch (error) {
      console.error("❌ [KYC] Erreur lors de la recherche:", error);
    }
    
    console.log("✅ [KYC] Traitement de verification.manual_review terminé");
    return NextResponse.json({ ok: true });
  }

  // L'utilisateur a ouvert/vu la page de vérification
  if (event.event === "session.created" || event.event === "session.viewed") {
    console.log(`👁️ [KYC] Session ${event.event} reçue`);
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    const sessionId = event.data?.id;
    
    if (metadata.companyId) {
      const companySnap = await db.collection("companies").doc(metadata.companyId).get();
      if (companySnap.exists && companySnap.data()?.kycStatus === "awaiting_submission") {
        await db.collection("companies").doc(metadata.companyId).update({ 
          kycStatus: "awaiting_submission",
          kycSessionId: sessionId
        });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Documents soumis
  if (event.event === "verification.started" || event.event === "document.submitted") {
    console.log(`📄 [KYC] ${event.event} reçu - Documents soumis`);
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    const verificationId = event.data?.id;
    
    if (metadata.companyId) {
      await db.collection("companies").doc(metadata.companyId).update({ 
        kycStatus: "pending",
        kycVerificationId: verificationId
      });
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

    let companyId = metadata.companyId;
    let uid = metadata.uid;

    // Si pas de companyId dans les métadonnées, on cherche par verificationId
    if (!companyId && verificationId) {
      console.log(`🔍 [KYC] Recherche de l'entreprise par verificationId: ${verificationId}`);
      const companiesSnapshot = await db
        .collection("companies")
        .where("kycVerificationId", "==", verificationId)
        .get();
      
      if (!companiesSnapshot.empty) {
        const doc = companiesSnapshot.docs[0];
        companyId = doc.id;
        console.log(`✅ [KYC] Entreprise trouvée: ${companyId}`);
      }
    }

    if (!companyId) {
      console.log("⚠️ [KYC] Pas de companyId, impossible de continuer");
      return NextResponse.json({ ok: true });
    }

    const newStatus = fraudDetected || riskLevel === "high"
      ? "review"
      : riskLevel === "low"
      ? "approved"
      : "review";

    await db.collection("companies").doc(companyId).update({
      kycStatus: newStatus,
      kycVerificationId: verificationId,
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
    });

    // Récupérer l'UID depuis l'entreprise si pas dans les métadonnées
    if (!uid) {
      const companySnap = await db.collection("companies").doc(companyId).get();
      uid = companySnap.data()?.ownerUid;
    }

    if (uid) {
      const title = newStatus === "approved" ? "KYC approuvé 🎉" : "KYC en révision";
      const body = newStatus === "approved"
        ? "Votre entreprise est maintenant vérifiée. Les paiements sont activés."
        : "Votre dossier KYC est en cours de révision manuelle. Vous serez notifié sous 24h.";

      await sendPushAndStore({
        uid,
        companyId,
        title,
        body,
        type: "kyc",
        link: `/kyc-pending?companyId=${companyId}`,
      });

      const userSnap = await db.collection("users").doc(uid).get();
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

// Fonction helper pour mettre à jour le KYC
async function updateCompanyKyc(
  db: any, 
  companyId: string, 
  companyData: any, 
  verificationId: string, 
  riskLevel: string, 
  fraudDetected: boolean
) {
  // 🔥 Récupérer l'UID depuis l'entreprise
  const uid = companyData?.ownerUid;
  
  console.log(`📊 [KYC] UID du propriétaire: ${uid}`);
  console.log(`🏢 [KYC] Mise à jour de l'entreprise ${companyId} vers "review"`);
  
  await db.collection("companies").doc(companyId).update({
    kycStatus: "review",
    kycVerificationId: verificationId,
    kycRiskLevel: riskLevel,
    kycReviewedAt: Date.now(),
  });
  console.log("✅ [KYC] Entreprise mise à jour: review");

  // Notification
  if (uid) {
    console.log(`📧 [KYC] Envoi des notifications pour l'utilisateur ${uid}`);
    
    const title = "KYC en révision manuelle ⏳";
    const body = "Votre dossier KYC est en cours de révision manuelle. Vous serez notifié sous 24h.";

    try {
      await sendPushAndStore({
        uid,
        companyId,
        title,
        body,
        type: "kyc",
        link: `/kyc-pending?companyId=${companyId}`,
      });
      console.log("✅ [KYC] Push notification envoyée");
    } catch (error) {
      console.error("❌ [KYC] Erreur push:", error);
    }

    try {
      const userSnap = await db.collection("users").doc(uid).get();
      const userEmail = userSnap.data()?.email;
      if (userEmail) {
        await sendTransactionalEmail({
          to: [{ email: userEmail, name: userSnap.data()?.displayName || "Utilisateur" }],
          subject: title,
          htmlContent: emailTemplate({
            title,
            body,
            ctaLabel: "Accéder au tableau de bord",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          }),
        });
        console.log(`✅ [KYC] Email envoyé à ${userEmail}`);
      }
    } catch (error) {
      console.error("❌ [KYC] Erreur email:", error);
    }
  } else {
    console.log("⚠️ [KYC] Pas d'UID trouvé pour l'entreprise");
  }
}