import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createProductSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, shopId, name, description, price, imageBase64, stock } = parseOrThrow(createProductSchema, raw);

    const limited = await checkRateLimit(`product-create:uid:${uid}`, 100, 3600);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de produits créés récemment. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const shopSnap = await db.collection("shops").doc(shopId).get();
    if (!shopSnap.exists) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });

    const shop = shopSnap.data()!;
    if (shop.ownerUid !== uid) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const productRef = db.collection("shopProducts").doc();
    const now = Date.now();
    const product = {
      id: productRef.id,
      shopId,
      name,
      description: description ?? null,
      price,
      imageBase64: imageBase64 ?? null,
      stock: stock ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await productRef.set(product);

    return NextResponse.json({ productId: productRef.id });
  } catch (err) {
    console.error("POST /api/shop/products/create:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
