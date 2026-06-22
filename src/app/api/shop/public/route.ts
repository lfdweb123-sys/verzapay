import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "Lien de boutique manquant" }, { status: 400 });

    const db = adminDb();
    const shopSnap = await db.collection("shops").where("slug", "==", slug).limit(1).get();
    if (shopSnap.empty) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });

    const shop = shopSnap.docs[0].data();
    if (!shop.isActive) return NextResponse.json({ error: "Cette boutique est actuellement fermée" }, { status: 404 });

    const productsSnap = await db
      .collection("shopProducts")
      .where("shopId", "==", shop.id)
      .where("isActive", "==", true)
      .limit(200)
      .get();

    const products = productsSnap.docs.map((d) => d.data());

    return NextResponse.json({ shop, products });
  } catch (err) {
    console.error("GET /api/shop/public:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
