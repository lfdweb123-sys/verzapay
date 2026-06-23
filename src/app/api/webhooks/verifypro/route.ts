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
  console.log(`📊 [KYC] Données complètes:`, JSON.stringify(event.data, null, 2));
  
  const db = adminDb();

  // 🔥 SESSION CREATED - On stocke le sessionId
  if (event.event === "session.created" || event.event === "session.viewed") {
    console.log(`👁️ [KYC] Session ${event.event} reçue`);
    const sessionId = event.data?.id;
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    
    console.log(`📊 [KYC] Session ID: ${sessionId}`);
    console.log(`📊 [KYC] Métadonnées:`, metadata);
    
    if (metadata.companyId) {
      const companySnap = await db.collection("companies").doc(metadata.companyId).get();
      if (companySnap.exists) {
        await db.collection("companies").doc(metadata.companyId).update({ 
          kycSessionId: sessionId
        });
        console.log(`✅ [KYC] SessionId ${sessionId} stocké pour l'entreprise ${metadata.companyId}`);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // 🔥 DOCUMENT SUBMITTED - On stocke le verificationId
  if (event.event === "document.submitted" || event.event === "verification.started") {
    console.log(`📄 [KYC] ${event.event} reçu - Documents soumis`);
    const verificationId = event.data?.id;
    const sessionId = event.data?.sessionId;
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    
    console.log(`📊 [KYC] Verification ID: ${verificationId}`);
    console.log(`📊 [KYC] Session ID: ${sessionId}`);
    console.log(`📊 [KYC] Métadonnées:`, metadata);
    
    let companyId = metadata.companyId;

    // Si pas de companyId, chercher par sessionId
    if (!companyId && sessionId) {
      console.log(`🔍 [KYC] Recherche par sessionId: ${sessionId}`);
      const companiesSnapshot = await db
        .collection("companies")
        .where("kycSessionId", "==", sessionId)
        .get();
      
      if (!companiesSnapshot.empty) {
        companyId = companiesSnapshot.docs[0].id;
        console.log(`✅ [KYC] Entreprise trouvée par sessionId: ${companyId}`);
      }
    }

    if (companyId) {
      await db.collection("companies").doc(companyId).update({ 
        kycStatus: "pending",
        kycVerificationId: verificationId // 🔥 STOCKAGE DU verificationId
      });
      console.log(`✅ [KYC] Statut mis à jour: pending pour ${companyId}`);
      console.log(`✅ [KYC] VerificationId stocké: ${verificationId}`);
    } else {
      console.log(`❌ [KYC] Impossible de trouver l'entreprise pour le document.submitted`);
    }
    return NextResponse.json({ ok: true });
  }

  // 🔥 MANUAL REVIEW - On utilise le verificationId stocké
  if (event.event === "verification.manual_review") {
    console.log("🔄 [KYC] Vérification en révision manuelle !");
    
    const data = event.data;
    const verificationId = data?.id;
    const riskLevel = data?.riskLevel ?? "medium";
    const fraudDetected = data?.fraudDetected ?? false;
    
    console.log(`📊 [KYC] ID de vérification: ${verificationId}`);
    console.log(`📊 [KYC] Niveau de risque: ${riskLevel}`);
    console.log(`📊 [KYC] Fraude détectée: ${fraudDetected}`);

    if (!verificationId) {
      console.log("❌ [KYC] Pas d'ID de vérification");
      return NextResponse.json({ ok: true });
    }

    // 🔥 RECHERCHE PAR verificationId (qui a été stocké lors de document.submitted)
    console.log(`🔍 [KYC] Recherche de l'entreprise avec kycVerificationId: ${verificationId}`);
    const companiesSnapshot = await db
      .collection("companies")
      .where("kycVerificationId", "==", verificationId)
      .get();

    if (companiesSnapshot.empty) {
      console.log(`❌ [KYC] Aucune entreprise trouvée avec kycVerificationId: ${verificationId}`);
      
      // 🔥 DERNIER RECOURS: Chercher dans toutes les entreprises et vérifier dans les logs
      console.log(`🔍 [KYC] Recherche dans toutes les entreprises...`);
      const allCompanies = await db.collection("companies").limit(100).get();
      console.log(`📊 [KYC] ${allCompanies.size} entreprises trouvées`);
      
      allCompanies.forEach(doc => {
        const data = doc.data();
        console.log(`📊 [KYC] Entreprise ${doc.id}: kycVerificationId=${data.kycVerificationId}, kycSessionId=${data.kycSessionId}`);
      });
      
      return NextResponse.json({ ok: true });
    }

    // Entreprise trouvée
    const doc = companiesSnapshot.docs[0];
    const companyId = doc.id;
    const companyData = doc.data();
    const uid = companyData?.ownerUid;
    
    console.log(`✅ [KYC] Entreprise trouvée: ${companyId} (${companyData.name})`);
    console.log(`✅ [KYC] Owner UID: ${uid}`);

    // Mettre à jour l'entreprise
    console.log(`🏢 [KYC] Mise à jour de l'entreprise ${companyId} vers "review"`);
    await db.collection("companies").doc(companyId).update({
      kycStatus: "review",
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
    });
    console.log("✅ [KYC] Entreprise mise à jour: review");

    // Envoyer les notifications
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
        const userData = userSnap.data();
        const userEmail = userData?.email;
        if (userEmail) {
          await sendTransactionalEmail({
            to: [{ email: userEmail, name: userData?.displayName || "Utilisateur" }],
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
    }
    
    console.log("✅ [KYC] Traitement de verification.manual_review terminé");
    return NextResponse.json({ ok: true });
  }

  // 🔥 VERIFICATION COMPLETED
  if (event.event === "verification.completed") {
    console.log(`✅ [KYC] Vérification terminée !`);
    const verificationId: string = event.data?.id;
    const riskLevel: string = event.data?.riskLevel ?? "medium";
    const fraudDetected: boolean = event.data?.fraudDetected ?? false;

    if (!verificationId) {
      console.log("❌ [KYC] Pas d'ID de vérification");
      return NextResponse.json({ ok: true });
    }

    // Rechercher par verificationId
    console.log(`🔍 [KYC] Recherche de l'entreprise par kycVerificationId: ${verificationId}`);
    const companiesSnapshot = await db
      .collection("companies")
      .where("kycVerificationId", "==", verificationId)
      .get();

    if (companiesSnapshot.empty) {
      console.log(`❌ [KYC] Aucune entreprise trouvée`);
      return NextResponse.json({ ok: true });
    }

    const doc = companiesSnapshot.docs[0];
    const companyId = doc.id;
    const companyData = doc.data();
    const uid = companyData?.ownerUid;

    const newStatus = fraudDetected || riskLevel === "high"
      ? "review"
      : riskLevel === "low" || riskLevel === "medium"
      ? "approved"
      : "review";

    console.log(`📊 [KYC] Nouveau statut: ${newStatus}`);

    await db.collection("companies").doc(companyId).update({
      kycStatus: newStatus,
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
    });

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