import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import crypto from "crypto";
import type { KycExtractedData } from "@/types";
import { notifyKycSubmission } from "@/lib/kyc-alert";

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

    await notifyKycSubmission(companyId, "pending");

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
    // ID du document kyc_mappings effectivement utilisé pour résoudre cet
    // événement, quelle que soit la méthode — sert plus bas à marquer CE
    // mapping précis comme "manual_review" une fois résolu, pour qu'il ne
    // reste jamais indéfiniment candidat à de futures résolutions ambiguës
    // (cf MÉTHODE 4 : sans ça, un mapping résolu via fallback continuerait à
    // compter comme "non résolu" à chaque appel suivant).
    let resolvedMappingDocId: string | null = null;
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
      resolvedMappingDocId = mappingSnap.id;
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

    // 🔥 MÉTHODE 3: Chercher une correspondance exacte de verificationId déjà
    // enregistrée sur un mapping "documents_submitted" (cas où document.submitted
    // a bien été reçu et a mis à jour ce champ, mais où la doc principale
    // kyc_mappings/{verificationId} n'a pas été créée pour une autre raison).
    if (!companyId) {
      console.log(`🔍 [KYC] Recherche d'une correspondance verificationId parmi les mappings documents_submitted`);

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

        if (data.verificationId === verificationId) {
          companyId = data.companyId;
          uid = data.userId;
          resolvedMappingDocId = doc.id;
          resolutionMethod = "kyc_mappings_documents_submitted_match";
          console.log(`✅ [KYC] Trouvé par correspondance: ${companyId}`);
          break;
        }
      }
    }

    // 🔥 MÉTHODE 4: Dernier recours - utiliser le mapping récent non résolu
    //
    // Ce chemin est le cas NORMAL (pas une vraie "dernière chance") pour les
    // flux VerifyPro qui ne déclenchent jamais document.submitted /
    // verification.started avant de passer directement à
    // verification.manual_review : le mapping reste alors bloqué à
    // "session_created" pour toujours, avec verificationId=null — les
    // MÉTHODES 1 à 3 ci-dessus ne peuvent structurellement jamais le trouver
    // dans ce cas, donc c'est cette méthode qui fait le travail réel.
    //
    // GARDE DE SÉCURITÉ EN DEUX TEMPS :
    //  1. FRAÎCHEUR — une session VerifyPro expire après ~60 minutes (cf
    //     /api/kyc/session, expiresInMinutes: 60). On ne considère donc que
    //     les mappings créés dans les 30 dernières minutes : un mapping plus
    //     vieux correspond à une session abandonnée/expirée et ne doit plus
    //     jamais être candidat, même s'il n'a jamais été marqué résolu. Ça
    //     élimine automatiquement l'accumulation de vieux tests en base sans
    //     avoir besoin de les nettoyer manuellement.
    //  2. AMBIGUÏTÉ — sur ce sous-ensemble déjà filtré par fraîcheur, on

    //     n'utilise le fallback QUE s'il reste exactement un candidat. Si
    //     plusieurs marchands ont un cycle KYC en cours simultanément dans
    //     cette même fenêtre de 30 minutes, deviner lequel correspond à
    //     l'événement risquerait d'écrire les données d'identité (nom, n° de
    //     pièce, date de naissance...) d'une personne dans le dossier KYC
    //     d'un autre marchand — une fuite de données personnelles, pas juste
    //     une erreur d'affichage. Dans ce cas on préfère ignorer l'événement
    //     (ack sans action, loggé en warning) plutôt que de deviner.
    if (!companyId) {
      console.log(`🔍 [KYC] Dernier recours: recherche de mappings récents non résolus (< 30 min)`);

      const FRESHNESS_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
      const cutoff = Date.now() - FRESHNESS_WINDOW_MS;

      const recentUnresolvedRaw = await db
        .collection("kyc_mappings")
        .where("status", "in", ["session_created", "documents_submitted"])
        .orderBy("createdAt", "desc")
        .limit(20) // marge avant filtrage par fraîcheur, au cas où plusieurs vieux mappings précèdent les récents
        .get();

      const freshCandidates = recentUnresolvedRaw.docs.filter((doc) => {
        const createdAt = doc.data()?.createdAt ?? 0;
        return createdAt >= cutoff;
      });

      console.log(
        `📊 [KYC] ${recentUnresolvedRaw.size} mappings non résolus au total, ${freshCandidates.length} dans la fenêtre de fraîcheur (< 30 min)`
      );

      if (freshCandidates.length === 1) {
        const onlyDoc = freshCandidates[0];
        const only = onlyDoc.data();
        companyId = only.companyId;
        uid = only.userId;
        resolvedMappingDocId = onlyDoc.id;
        resolutionMethod = "fallback_single_fresh_unresolved_candidate";
        console.log(`✅ [KYC] Un seul candidat récent non résolu trouvé, utilisation: ${companyId}`);
      } else if (freshCandidates.length > 1) {
        console.warn(
          `⚠️ [KYC] ${freshCandidates.length} candidats récents (< 30 min) trouvés simultanément -> ambigu, ABANDON du fallback pour éviter une mauvaise attribution de données d'identité.`
        );
      } else {
        console.log(`❌ [KYC] Aucun candidat récent (< 30 min) trouvé — les mappings non résolus existants sont trop anciens (sessions expirées/abandonnées)`);
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
    await notifyKycSubmission(companyId, "review");

    // 🔥 Marquer le mapping effectivement utilisé comme résolu, pour qu'il
    // ne reste jamais indéfiniment candidat à de futures résolutions (cf
    // commentaire sur resolvedMappingDocId plus haut). On n'utilise PAS
    // event.data?.sessionId ici : ce champ n'existe pas dans le payload
    // verification.manual_review observé (seulement id, extractedData,
    // faceMatch, amlResult...) — s'appuyer dessus laissait le mapping
    // éternellement "non résolu" même après une résolution réussie.
    if (resolvedMappingDocId) {
      await db.collection("kyc_mappings").doc(resolvedMappingDocId).update({
        verificationId,
        status: "manual_review",
      });
      console.log(`✅ [KYC] Mapping ${resolvedMappingDocId} marqué résolu (manual_review) avec verificationId: ${verificationId}`);
    } else {
      console.warn(`⚠️ [KYC] Aucun mapping document identifié à marquer résolu — vérifier la cohérence des méthodes de résolution`);
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