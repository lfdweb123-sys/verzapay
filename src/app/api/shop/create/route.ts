import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createShopSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyRequestUid } from "@/lib/auth-token";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, companyId, name, slug, description, whatsappNumber } = parseOrThrow(createShopSchema, raw);
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }


    const limited = await checkRateLimit(`shop-create:uid:${uid}`, 10, 3600);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;
    if (!Array.isArray(company.members) || !company.members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (company.kycStatus !== "approved") {
      return NextResponse.json({ error: "L'entreprise doit être vérifiée (KYC approuvé) pour créer une boutique" }, { status: 403 });
    }
    if (!company.apiKeySecretGenerated) {
      return NextResponse.json({ error: "Générez d'abord une clé API fonctionnelle pour cette entreprise (Développeur)" }, { status: 403 });
    }

    const slugCheck = await db.collection("shops").where("slug", "==", slug).limit(1).get();
    if (!slugCheck.empty) {
      return NextResponse.json({ error: "Ce lien de boutique est déjà utilisé, choisissez-en un autre" }, { status: 409 });
    }

    const shopRef = db.collection("shops").doc();
    const now = Date.now();
    const shop = {
      id: shopRef.id,
      companyId,
      ownerUid: uid,
      slug,
      name,
      description: description ?? null,
      logoBase64: null,
      coverBase64: null,
      primaryColor: "#0C447C",
      whatsappNumber: whatsappNumber ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await shopRef.set(shop);

    return NextResponse.json({ shopId: shopRef.id, slug });
  } catch (err) {
    console.error("POST /api/shop/create:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
