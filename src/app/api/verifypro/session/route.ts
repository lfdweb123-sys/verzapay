import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createVerifyProSession } from "@/lib/verifypro";
import { notifyAdmin } from "@/lib/notify-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  console.log("🚀 [KYC SESSION] Création d'une session KYC");

  try {
    const { companyId, uid, email, displayName } = await req.json();
    console.log(`📊 [KYC SESSION] companyId: ${companyId}, uid: ${uid}, email: ${email}`);

    if (!companyId || typeof companyId !== "string" || !uid || typeof uid !== "string") {
      console.log("❌ [KYC SESSION] Paramètres manquants");
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const limited = await checkRateLimit(`kyc-session:uid:${uid}`, 10, 3600); // 10 tentatives / heure
    if (!limited.allowed) {
      console.log("❌ [KYC SESSION] Trop de tentatives");
      return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) {
      console.log("❌ [KYC SESSION] Entreprise introuvable");
      return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    }

    const company = companySnap.data()!;
    console.log(`📊 [KYC SESSION] Entreprise: ${company.name}`);

    // Vérif que l'utilisateur est bien membre
    if (!company.members?.includes(uid)) {
      console.log("❌ [KYC SESSION] Accès refusé - utilisateur non membre");
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // 🔥 NETTOYAGE : un marchand ne doit jamais avoir plusieurs sessions KYC
    // "en attente" actives simultanément. Avant de créer la nouvelle session,
    // on marque tous les anciens mappings non résolus (session_created /
    // documents_submitted) de CE companyId comme "abandoned" — ça évite que
    // le webhook /api/webhooks/verifypro se retrouve plus tard avec plusieurs
    // candidats "non résolus" ambigus pour différents marchands en même temps,
    // qui forçait jusqu'ici à abandonner la résolution par sécurité. Une
    // nouvelle tentative du même marchand remplace toujours l'ancienne, elle
    // ne s'accumule jamais avec elle.
    console.log(`🧹 [KYC SESSION] Nettoyage des anciens mappings non résolus pour companyId=${companyId}...`);
    const staleMappings = await db
      .collection("kyc_mappings")
      .where("companyId", "==", companyId)
      .where("status", "in", ["session_created", "documents_submitted"])
      .get();

    if (!staleMappings.empty) {
      const batch = db.batch();
      staleMappings.docs.forEach((doc) => {
        batch.update(doc.ref, { status: "abandoned", abandonedAt: Date.now() });
      });
      await batch.commit();
      console.log(`✅ [KYC SESSION] ${staleMappings.size} ancien(s) mapping(s) marqué(s) abandoned`);
    } else {
      console.log(`📊 [KYC SESSION] Aucun ancien mapping à nettoyer`);
    }

    // Créer la session VerifyPro
    console.log("🔄 [KYC SESSION] Création de la session VerifyPro...");
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

    console.log(`✅ [KYC SESSION] Session créée: ${session.sessionId}`);
    console.log(`📊 [KYC SESSION] Verification URL: ${session.verificationUrl}`);

    // 🔥 STOCKER LE MAPPING sessionId -> companyId dans kyc_mappings
    console.log(`📝 [KYC SESSION] Stockage du mapping dans kyc_mappings...`);
    await db.collection("kyc_mappings").doc(session.sessionId).set({
      companyId,
      userId: uid,
      sessionId: session.sessionId,
      verificationId: null, // Sera mis à jour plus tard
      status: "session_created",
      createdAt: Date.now(),
      expiresAt: session.expiresAt,
    });
    console.log(`✅ [KYC SESSION] Mapping stocké: ${session.sessionId} -> ${companyId}`);

    // Mettre à jour l'entreprise
    await db.collection("companies").doc(companyId).update({
      kycStatus: "awaiting_submission",
      kycSessionId: session.sessionId,
    });
    console.log(`✅ [KYC SESSION] Entreprise mise à jour: awaiting_submission`);

    // Notifier l'admin
    await notifyAdmin({
      title: "Nouvelle demande de vérification KYC",
      body: `L'entreprise <strong>${company.name}</strong> (${company.country}) a démarré sa vérification d'identité.`,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    });
    console.log(`✅ [KYC SESSION] Admin notifié`);

    return NextResponse.json({
      sessionId: session.sessionId,
      verificationUrl: session.verificationUrl,
      expiresAt: session.expiresAt,
    });

  } catch (err) {
    console.error("❌ [KYC SESSION] Erreur:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}