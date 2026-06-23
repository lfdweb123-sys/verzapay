import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import crypto from "crypto";

function verifySignature(payload: string, header: string, secret: string): boolean {
  console.log("🔐 [KYC] Vérification de la signature...");
  console.log(`🔐 [KYC] Header signature: ${header}`);
  console.log(`🔐 [KYC] Secret présent: ${secret ? "OUI" : "NON"}`);
  
  try {
    const parts = header.split(",");
    console.log(`🔐 [KYC] Parts: ${JSON.stringify(parts)}`);
    
    const tsPart = parts.find((p) => p.startsWith("t="));
    const sigPart = parts.find((p) => p.startsWith("v1="));
    
    if (!tsPart || !sigPart) {
      console.log("❌ [KYC] Signature invalide: tsPart ou sigPart manquant");
      return false;
    }
    
    const timestamp = tsPart.replace("t=", "");
    const signature = sigPart.replace("v1=", "");
    const signed = `${timestamp}.${payload}`;
    const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
    
    console.log(`🔐 [KYC] Timestamp: ${timestamp}`);
    console.log(`🔐 [KYC] Signature reçue: ${signature}`);
    console.log(`🔐 [KYC] Signature attendue: ${expected}`);
    
    const isValid = crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    console.log(`🔐 [KYC] Signature valide: ${isValid}`);
    
    return isValid;
  } catch (error) {
    console.error("❌ [KYC] Erreur lors de la vérification de la signature:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  console.log("🚀 [KYC] Webhook reçu !");
  console.log(`🚀 [KYC] Méthode: ${req.method}`);
  console.log(`🚀 [KYC] Headers:`, Object.fromEntries(req.headers.entries()));
  
  const rawBody = await req.text();
  console.log(`📦 [KYC] Raw body: ${rawBody.substring(0, 500)}${rawBody.length > 500 ? "..." : ""}`);
  
  const signature = req.headers.get("x-verifypro-signature") ?? "";
  const secret = process.env.VERIFYPRO_WEBHOOK_SECRET ?? "";

  if (secret && !verifySignature(rawBody, signature, secret)) {
    console.log("❌ [KYC] Signature invalide, rejet de la requête");
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
    console.log("✅ [KYC] JSON parsé avec succès");
    console.log(`📊 [KYC] Événement reçu: ${event.event}`);
    console.log(`📊 [KYC] Données complètes:`, JSON.stringify(event, null, 2));
  } catch (error) {
    console.error("❌ [KYC] Erreur lors du parsing JSON:", error);
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const db = adminDb();

  // L'utilisateur a ouvert/vu la page de vérification — le lien a été cliqué,
  // mais aucun document n'a forcément été soumis encore. On reste en
  // "awaiting_submission" tant qu'on n'a pas confirmation qu'un document a
  // été envoyé pour analyse.
  if (event.event === "session.created" || event.event === "session.viewed") {
    console.log(`👁️ [KYC] Session ${event.event} reçue`);
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    console.log(`👁️ [KYC] Métadonnées:`, metadata);
    
    if (metadata.companyId) {
      console.log(`🏢 [KYC] Récupération de l'entreprise ${metadata.companyId}`);
      const companySnap = await db.collection("companies").doc(metadata.companyId).get();
      
      if (companySnap.exists) {
        const currentStatus = companySnap.data()?.kycStatus;
        console.log(`📊 [KYC] Statut KYC actuel: ${currentStatus}`);
        
        // Ne touche au statut que s'il est encore à "awaiting_submission" pour
        // éviter d'écraser un statut plus avancé (pending/approved/rejected)
        // en cas de webhook reçu hors ordre.
        if (currentStatus === "awaiting_submission") {
          console.log(`🔄 [KYC] Mise à jour du statut KYC: awaiting_submission (inchangé)`);
          await db.collection("companies").doc(metadata.companyId).update({ kycStatus: "awaiting_submission" });
        } else {
          console.log(`⏭️ [KYC] Statut KYC déjà à ${currentStatus}, pas de mise à jour`);
        }
      } else {
        console.log(`❌ [KYC] Entreprise ${metadata.companyId} non trouvée`);
      }
    } else {
      console.log(`⚠️ [KYC] Pas de companyId dans les métadonnées`);
    }
    console.log("✅ [KYC] Session traitée avec succès");
    return NextResponse.json({ ok: true });
  }

  // Documents réellement soumis, analyse démarrée côté VerifyPro
  if (event.event === "verification.started" || event.event === "document.submitted") {
    console.log(`📄 [KYC] ${event.event} reçu - Documents soumis`);
    const metadata: { companyId?: string } = event.data?.metadata ?? {};
    console.log(`📄 [KYC] Métadonnées:`, metadata);
    
    if (metadata.companyId) {
      console.log(`🏢 [KYC] Mise à jour de l'entreprise ${metadata.companyId} vers "pending"`);
      await db.collection("companies").doc(metadata.companyId).update({ kycStatus: "pending" });
      console.log(`✅ [KYC] Statut KYC mis à jour: pending`);
    } else {
      console.log(`⚠️ [KYC] Pas de companyId dans les métadonnées`);
    }
    console.log("✅ [KYC] Traitement terminé");
    return NextResponse.json({ ok: true });
  }

  if (event.event === "verification.completed") {
    console.log(`✅ [KYC] Vérification terminée !`);
    const verificationId: string = event.data?.id;
    const riskLevel: string = event.data?.riskLevel ?? "medium";
    const fraudDetected: boolean = event.data?.fraudDetected ?? false;
    const metadata: { companyId?: string; uid?: string } = event.data?.metadata ?? {};
    
    console.log(`📊 [KYC] ID de vérification: ${verificationId}`);
    console.log(`📊 [KYC] Niveau de risque: ${riskLevel}`);
    console.log(`📊 [KYC] Fraude détectée: ${fraudDetected}`);
    console.log(`📊 [KYC] Métadonnées:`, metadata);

    if (!metadata.companyId) {
      console.log(`⚠️ [KYC] Pas de companyId, impossible de continuer`);
      return NextResponse.json({ ok: true });
    }

    const newStatus = fraudDetected || riskLevel === "high"
      ? "review"
      : riskLevel === "low"
      ? "approved"
      : "review";

    console.log(`📊 [KYC] Nouveau statut calculé: ${newStatus}`);

    // Mise à jour de l'entreprise
    console.log(`🏢 [KYC] Mise à jour de l'entreprise ${metadata.companyId}`);
    await db.collection("companies").doc(metadata.companyId).update({
      kycStatus: newStatus,
      kycVerificationId: verificationId,
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
    });
    console.log(`✅ [KYC] Entreprise mise à jour avec succès`);

    // Notification push + email
    if (metadata.uid) {
      console.log(`📧 [KYC] Envoi des notifications pour l'utilisateur ${metadata.uid}`);
      
      const title = newStatus === "approved" ? "KYC approuvé 🎉" : "KYC en révision";
      const body = newStatus === "approved"
        ? "Votre entreprise est maintenant vérifiée. Les paiements sont activés."
        : "Votre dossier KYC est en cours de révision manuelle. Vous serez notifié sous 24h.";

      console.log(`📧 [KYC] Titre: ${title}`);
      console.log(`📧 [KYC] Corps: ${body}`);

      try {
        await sendPushAndStore({
          uid: metadata.uid,
          companyId: metadata.companyId,
          title,
          body,
          type: "kyc",
          link: `/kyc-pending?companyId=${metadata.companyId}`,
        });
        console.log(`✅ [KYC] Push notification envoyée avec succès`);
      } catch (error) {
        console.error(`❌ [KYC] Erreur lors de l'envoi de la push:`, error);
      }

      // Envoi de l'email
      try {
        const userSnap = await db.collection("users").doc(metadata.uid).get();
        const userData = userSnap.data();
        const userEmail = userData?.email;
        console.log(`📧 [KYC] Email utilisateur: ${userEmail}`);
        
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
          console.log(`✅ [KYC] Email envoyé avec succès à ${userEmail}`);
        } else {
          console.log(`⚠️ [KYC] Pas d'email pour l'utilisateur ${metadata.uid}`);
        }
      } catch (error) {
        console.error(`❌ [KYC] Erreur lors de l'envoi de l'email:`, error);
      }
    } else {
      console.log(`⚠️ [KYC] Pas d'UID dans les métadonnées, notifications non envoyées`);
    }
    console.log("✅ [KYC] Vérification complétée avec succès");
  }

  console.log("🏁 [KYC] Fin du traitement du webhook");
  return NextResponse.json({ ok: true });
}