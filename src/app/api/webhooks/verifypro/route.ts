import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import crypto from "crypto";
import type { KycExtractedData } from "@/types";

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

/**
 * Construit l'objet kycExtractedData stocké sur Company à partir du payload
 * brut VerifyPro (extractedData + faceMatch + amlResult). Tous les champs
 * sources sont optionnels côté webhook -> tous les champs de sortie restent
 * optionnels également, jamais de valeur inventée si absente du payload.
 */
function buildExtractedData(event: any): KycExtractedData {
  const extracted = event.data?.extractedData ?? {};
  const faceMatch = event.data?.faceMatch ?? {};
  const aml = event.data?.amlResult ?? {};

  return {
    firstName: extracted.firstName ?? null,
    lastName: extracted.lastName ?? null,
    birthDate: extracted.birthDate ?? null,
    docNumber: extracted.docNumber ?? null,
    expiryDate: extracted.expiryDate ?? null,
    nationality: extracted.nationality ?? null,
    address: extracted.address ?? null,
    documentExpired: typeof extracted.expired === "boolean" ? extracted.expired : null,
    tamperingDetected: typeof extracted.tamperingDetected === "boolean" ? extracted.tamperingDetected : null,
    confidenceScore: typeof extracted.confidenceScore === "number" ? extracted.confidenceScore : null,
    documentType: event.data?.documentType ?? null,
    overallScore: typeof event.data?.overallScore === "number" ? event.data.overallScore : null,
    faceMatchScore: typeof faceMatch.similarityScore === "number" ? faceMatch.similarityScore : null,
    faceMatchLivenessConfirmed: typeof faceMatch.livenessConfirmed === "boolean" ? faceMatch.livenessConfirmed : null,
    faceMatchNeedsManualReview: typeof faceMatch.needsManualReview === "boolean" ? faceMatch.needsManualReview : null,
    amlSanctionsMatch: typeof aml.sanctionsMatch === "boolean" ? aml.sanctionsMatch : null,
    amlPepMatch: typeof aml.pepMatch === "boolean" ? aml.pepMatch : null,
    amlRiskScore: typeof aml.kycRiskScore === "number" ? aml.kycRiskScore : null,
    extractedAt: Date.now(),
  };
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
  console.log(`📊 [KYC] Données brutes:`, JSON.stringify(event.data, null, 2));

  const db = adminDb();

  // ============================================================
  // 1. SESSION CREATED - Stocker sessionId
  // ============================================================
  if (event.event === "session.created") {
    console.log("👁️ [KYC] Session créée");
    const sessionId = event.data?.id;
    const metadata = event.data?.metadata || {};
    const companyId = metadata.companyId;
    const uid = metadata.uid;

    console.log(`📊 [KYC] Session ID: ${sessionId}`);
    console.log(`📊 [KYC] Company ID: ${companyId}`);
    console.log(`📊 [KYC] UID: ${uid}`);

    if (companyId && sessionId) {
      // Stocker dans kyc_mappings
      await db.collection("kyc_mappings").doc(sessionId).set({
        companyId,
        userId: uid,
        sessionId,
        verificationId: null,
        status: "session_created",
        createdAt: Date.now()
      });

      // Mettre à jour l'entreprise
      await db.collection("companies").doc(companyId).update({
        kycSessionId: sessionId,
        kycStatus: "awaiting_submission"
      });

      console.log(`✅ [KYC] Mapping créé: ${sessionId} -> ${companyId}`);
    }
    return NextResponse.json({ ok: true });
  }

  // ============================================================
  // 2. DOCUMENT SUBMITTED - Stocker verificationId
  // ============================================================
  if (event.event === "document.submitted" || event.event === "verification.started") {
    console.log(`📄 [KYC] ${event.event} reçu`);
    const verificationId = event.data?.id;
    const sessionId = event.data?.sessionId;

    console.log(`📊 [KYC] Verification ID: ${verificationId}`);
    console.log(`📊 [KYC] Session ID: ${sessionId}`);

    if (!verificationId) {
      console.log("❌ [KYC] Pas de verificationId");
      return NextResponse.json({ ok: true });
    }

    let companyId = null;
    let uid = null;

    // Chercher dans kyc_mappings par sessionId
    if (sessionId) {
      console.log(`🔍 [KYC] Recherche dans kyc_mappings par sessionId: ${sessionId}`);
      const mappingSnap = await db.collection("kyc_mappings").doc(sessionId).get();
      if (mappingSnap.exists) {
        const mapping = mappingSnap.data()!;
        companyId = mapping.companyId;
        uid = mapping.userId;
        console.log(`✅ [KYC] CompanyId trouvé dans kyc_mappings: ${companyId}`);
      }
    }

    // Chercher dans companies par kycSessionId
    if (!companyId && sessionId) {
      console.log(`🔍 [KYC] Recherche dans companies par kycSessionId: ${sessionId}`);
      const companiesSnap = await db
        .collection("companies")
        .where("kycSessionId", "==", sessionId)
        .get();

      if (!companiesSnap.empty) {
        const doc = companiesSnap.docs[0];
        companyId = doc.id;
        uid = doc.data()?.ownerUid;
        console.log(`✅ [KYC] CompanyId trouvé dans companies: ${companyId}`);
      }
    }

    if (!companyId) {
      console.log(`❌ [KYC] Impossible de trouver le companyId`);
      return NextResponse.json({ ok: true });
    }

    // 🔥 STOCKER LE MAPPING verificationId -> companyId
    await db.collection("kyc_mappings").doc(verificationId).set({
      companyId,
      userId: uid,
      sessionId,
      verificationId,
      status: "documents_submitted",
      createdAt: Date.now()
    });

    // Mettre à jour l'entreprise
    await db.collection("companies").doc(companyId).update({
      kycVerificationId: verificationId,
      kycStatus: "pending"
    });

    console.log(`✅ [KYC] Mapping créé: ${verificationId} -> ${companyId}`);
    console.log(`✅ [KYC] Entreprise ${companyId} mise à jour: pending`);

    return NextResponse.json({ ok: true });
  }

  // ============================================================
  // 3. MANUAL REVIEW - Recherche par verificationId OU sessionId
  // ============================================================
  if (event.event === "verification.manual_review") {
    console.log("🔄 [KYC] Vérification en révision manuelle !");

    const verificationId = event.data?.id;
    const riskLevel = event.data?.riskLevel ?? "medium";
    const fraudDetected = event.data?.fraudDetected ?? false;

    console.log(`📊 [KYC] Verification ID: ${verificationId}`);
    console.log(`📊 [KYC] Risk Level: ${riskLevel}`);
    console.log(`📊 [KYC] Fraud Detected: ${fraudDetected}`);

    if (!verificationId) {
      console.log("❌ [KYC] Pas de verificationId");
      return NextResponse.json({ ok: true });
    }

    let companyId = null;
    let uid = null;
    // Trace la méthode de résolution utilisée, uniquement pour les logs —
    // utile pour repérer si la méthode 4 "dernier recours" a été déclenchée
    // (signal qu'il faudrait enquêter sur pourquoi verificationId n'a pas
    // matché plus tôt, ex: document.submitted jamais reçu pour ce cycle).
    let resolutionMethod = "none";

    // 🔥 MÉTHODE 1: Chercher dans kyc_mappings par verificationId
    console.log(`🔍 [KYC] Recherche dans kyc_mappings par verificationId: ${verificationId}`);
    const mappingSnap = await db.collection("kyc_mappings").doc(verificationId).get();

    if (mappingSnap.exists) {
      const mapping = mappingSnap.data()!;
      companyId = mapping.companyId;
      uid = mapping.userId;
      resolutionMethod = "kyc_mappings_by_verificationId";
      console.log(`✅ [KYC] Mapping trouvé dans kyc_mappings: ${companyId}`);
    }

    // 🔥 MÉTHODE 2: Chercher dans companies par kycVerificationId
    if (!companyId) {
      console.log(`🔍 [KYC] Recherche dans companies par kycVerificationId: ${verificationId}`);
      const companiesSnap = await db
        .collection("companies")
        .where("kycVerificationId", "==", verificationId)
        .get();

      if (!companiesSnap.empty) {
        const doc = companiesSnap.docs[0];
        companyId = doc.id;
        uid = doc.data()?.ownerUid;
        resolutionMethod = "companies_by_kycVerificationId";
        console.log(`✅ [KYC] CompanyId trouvé dans companies: ${companyId}`);
      }
    }

    // 🔥 MÉTHODE 3: Chercher le sessionId dans les mappings (fallback)
    if (!companyId) {
      console.log(`🔍 [KYC] Recherche du sessionId associé à cette verificationId`);

      // Chercher dans tous les mappings pour trouver le sessionId
      const allMappings = await db
        .collection("kyc_mappings")
        .where("status", "==", "documents_submitted")
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();

      console.log(`📊 [KYC] ${allMappings.size} mappings documents_submitted trouvés`);

      for (const doc of allMappings.docs) {
        const data = doc.data();
        console.log(`📊 [KYC] Mapping: ${doc.id} -> companyId=${data.companyId}, sessionId=${data.sessionId}, verificationId=${data.verificationId}`);

        // Si le verificationId correspond OU si c'est le plus récent
        if (data.verificationId === verificationId) {
          companyId = data.companyId;
          uid = data.userId;
          resolutionMethod = "kyc_mappings_documents_submitted_match";
          console.log(`✅ [KYC] Trouvé par correspondance: ${companyId}`);
          break;
        }
      }
    }

    // 🔥 MÉTHODE 4: Dernier recours - utiliser le sessionId du mapping récent
    //
    // GARDE DE SÉCURITÉ : on ne déclenche ce fallback QUE s'il existe une
    // seule entreprise candidate plausible (un seul mapping "en attente" non
    // résolu, tous statuts confondus, le plus récent étant largement isolé
    // dans le temps). Si plusieurs marchands ont un cycle KYC en cours
    // simultanément, deviner lequel correspond à cet événement risquerait
    // d'écrire les données d'identité (nom, n° de pièce, date de naissance...)
    // d'une personne dans le dossier KYC d'un autre marchand — une fuite de
    // données personnelles, pas juste une erreur d'affichage. Dans ce cas on
    // préfère ignorer l'événement (ack sans action) plutôt que de deviner.
    if (!companyId) {
      console.log(`🔍 [KYC] Dernier recours: recherche de mappings récents non résolus`);

      const recentUnresolved = await db
        .collection("kyc_mappings")
        .where("status", "in", ["session_created", "documents_submitted"])
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();

      console.log(`📊 [KYC] ${recentUnresolved.size} mappings récents non résolus (status in [session_created, documents_submitted])`);

      if (recentUnresolved.size === 1) {
        const only = recentUnresolved.docs[0].data();
        companyId = only.companyId;
        uid = only.userId;
        resolutionMethod = "fallback_single_unresolved_candidate";
        console.log(`✅ [KYC] Un seul candidat non résolu trouvé, utilisation: ${companyId}`);
      } else if (recentUnresolved.size > 1) {
        console.warn(
          `⚠️ [KYC] ${recentUnresolved.size} candidats non résolus trouvés simultanément -> ambigu, ABANDON du fallback pour éviter une mauvaise attribution de données d'identité.`
        );
      } else {
        console.log(`❌ [KYC] Aucun candidat non résolu trouvé`);
      }
    }

    if (!companyId) {
      console.log(`❌ [KYC] Impossible de trouver l'entreprise, abandon`);
      return NextResponse.json({ ok: true });
    }

    console.log(`📊 [KYC] Méthode de résolution utilisée: ${resolutionMethod}`);

    // Récupérer l'UID si pas trouvé
    if (!uid) {
      const companySnap = await db.collection("companies").doc(companyId).get();
      if (companySnap.exists) {
        uid = companySnap.data()?.ownerUid;
        console.log(`📊 [KYC] UID récupéré depuis l'entreprise: ${uid}`);
      }
    }

    // 🔥 Construire et stocker les données extraites automatiquement
    const extractedData = buildExtractedData(event);
    console.log(`📊 [KYC] Données extraites construites:`, JSON.stringify(extractedData));

    // 🔥 Mettre à jour l'entreprise avec verificationId si pas encore fait
    console.log(`🏢 [KYC] Mise à jour de l'entreprise ${companyId} vers "review"`);
    const updateData: any = {
      kycStatus: "review",
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
      kycExtractedData: extractedData,
    };

    // Si verificationId n'est pas stocké, on le met à jour
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (companySnap.exists && !companySnap.data()?.kycVerificationId) {
      updateData.kycVerificationId = verificationId;
    }

    await db.collection("companies").doc(companyId).update(updateData);
    console.log("✅ [KYC] Entreprise mise à jour: review (avec données extraites)");

    // 🔥 Mettre à jour le mapping avec verificationId
    const sessionId = event.data?.sessionId;
    if (sessionId) {
      const mappingDoc = await db.collection("kyc_mappings").doc(sessionId).get();
      if (mappingDoc.exists) {
        await db.collection("kyc_mappings").doc(sessionId).update({
          verificationId,
          status: "manual_review"
        });
        console.log(`✅ [KYC] Mapping mis à jour avec verificationId: ${verificationId}`);
      }
    }

    // Envoyer les notifications
    if (uid) {
      await sendNotifications(db, uid, companyId, "review");
    }

    return NextResponse.json({ ok: true });
  }

  // ============================================================
  // 4. VERIFICATION COMPLETED
  // ============================================================
  if (event.event === "verification.completed") {
    console.log("✅ [KYC] Vérification terminée !");
    const verificationId = event.data?.id;
    const riskLevel = event.data?.riskLevel ?? "medium";
    const fraudDetected = event.data?.fraudDetected ?? false;

    if (!verificationId) {
      console.log("❌ [KYC] Pas de verificationId");
      return NextResponse.json({ ok: true });
    }

    let companyId = null;
    let uid = null;

    // Chercher dans kyc_mappings
    const mappingSnap = await db.collection("kyc_mappings").doc(verificationId).get();
    if (mappingSnap.exists) {
      const mapping = mappingSnap.data()!;
      companyId = mapping.companyId;
      uid = mapping.userId;
      console.log(`✅ [KYC] Mapping trouvé: ${companyId}`);
    }

    if (!companyId) {
      // Chercher dans companies
      const companiesSnap = await db
        .collection("companies")
        .where("kycVerificationId", "==", verificationId)
        .get();

      if (!companiesSnap.empty) {
        companyId = companiesSnap.docs[0].id;
        uid = companiesSnap.docs[0].data()?.ownerUid;
      }
    }

    if (!companyId) {
      console.log(`❌ [KYC] Impossible de trouver l'entreprise`);
      return NextResponse.json({ ok: true });
    }

    const newStatus = fraudDetected || riskLevel === "high"
      ? "review"
      : "approved";

    // 🔥 Construire et stocker (ou compléter) les données extraites — un
    // verification.completed peut apporter des champs supplémentaires par
    // rapport au manual_review précédent (ex: amlResult finalisé). On fusionne
    // avec l'existant plutôt que d'écraser, pour ne jamais perdre un champ
    // déjà capturé si ce payload-ci en dit moins.
    const existingCompanySnap = await db.collection("companies").doc(companyId).get();
    const existingExtracted = existingCompanySnap.data()?.kycExtractedData ?? {};
    const newExtracted = buildExtractedData(event);
    const mergedExtracted: KycExtractedData = {
      ...existingExtracted,
      ...Object.fromEntries(
        Object.entries(newExtracted).filter(([, v]) => v !== null && v !== undefined)
      ),
      extractedAt: Date.now(),
    };

    await db.collection("companies").doc(companyId).update({
      kycStatus: newStatus,
      kycRiskLevel: riskLevel,
      kycReviewedAt: Date.now(),
      kycExtractedData: mergedExtracted,
    });

    console.log(`✅ [KYC] Entreprise ${companyId} mise à jour: ${newStatus} (avec données extraites fusionnées)`);

    if (uid) {
      await sendNotifications(db, uid, companyId, newStatus);
    }
  }

  console.log("🏁 [KYC] Fin du traitement");
  return NextResponse.json({ ok: true });
}

// ============================================================
// FONCTIONS HELPERS
// ============================================================

async function sendNotifications(db: any, uid: string, companyId: string, status: string) {
  console.log(`📧 [KYC] Envoi des notifications pour l'utilisateur ${uid}`);

  const title = status === "approved" ? "KYC approuvé 🎉" : "KYC en révision manuelle ⏳";
  const body = status === "approved"
    ? "Votre entreprise est maintenant vérifiée. Les paiements sont activés."
    : "Votre dossier KYC est en cours de révision manuelle. Vous serez notifié sous 24h.";

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