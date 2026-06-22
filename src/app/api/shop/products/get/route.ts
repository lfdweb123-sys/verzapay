import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const productId = req.nextUrl.searchParams.get("productId");
    if (!uid || !productId) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    const db = adminDb();
    const productSnap = await db.collection("shopProducts").doc(productId).get();
    if (!productSnap.exists) return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });

    const product = productSnap.data()!;
    const shopSnap = await db.collection("shops").doc(product.shopId).get();
    if (!shopSnap.exists || shopSnap.data()?.ownerUid !== uid) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    return NextResponse.json({ product });
  } catch (err) {
    console.error("GET /api/shop/products/get:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
