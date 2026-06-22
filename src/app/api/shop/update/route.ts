import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { updateShopSchema, parseOrThrow } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, shopId, ...updates } = parseOrThrow(updateShopSchema, raw);

    const db = adminDb();
    const shopRef = db.collection("shops").doc(shopId);
    const shopSnap = await shopRef.get();
    if (!shopSnap.exists) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });

    const shop = shopSnap.data()!;
    if (shop.ownerUid !== uid) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const cleanUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) cleanUpdates[key] = value;
    }

    await shopRef.update(cleanUpdates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/shop/update:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
