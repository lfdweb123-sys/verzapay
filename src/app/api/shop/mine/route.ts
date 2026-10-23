import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!uid || !companyId) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    const company = companySnap.data()!;
    if (!Array.isArray(company.members) || !company.members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const shopSnap = await db.collection("shops").where("companyId", "==", companyId).limit(1).get();
    if (shopSnap.empty) return NextResponse.json({ shop: null, products: [], orders: [] });

    const shop = shopSnap.docs[0].data();

    const [productsSnap, ordersSnap] = await Promise.all([
      db.collection("shopProducts").where("shopId", "==", shop.id).orderBy("createdAt", "desc").limit(200).get(),
      db.collection("shopOrders").where("shopId", "==", shop.id).orderBy("createdAt", "desc").limit(100).get(),
    ]);

    return NextResponse.json({
      shop,
      products: productsSnap.docs.map((d) => d.data()),
      orders: ordersSnap.docs.map((d) => d.data()),
    });
  } catch (err) {
    console.error("GET /api/shop/mine:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
