import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { updateProductSchema, parseOrThrow } from "@/lib/validation";
import { verifyRequestUid } from "@/lib/auth-token";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, productId, ...updates } = parseOrThrow(updateProductSchema, raw);
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }


    const db = adminDb();
    const productRef = db.collection("shopProducts").doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });

    const product = productSnap.data()!;
    const shopSnap = await db.collection("shops").doc(product.shopId).get();
    if (!shopSnap.exists || shopSnap.data()?.ownerUid !== uid) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const cleanUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) cleanUpdates[key] = value;
    }

    await productRef.update(cleanUpdates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/shop/products/update:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
