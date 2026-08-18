import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

const OLD_RATE = 0.015;
const NEW_RATE = 0.005;

/**
 * Migration ponctuelle : aligne companies.commissionRate sur le nouveau
 * taux plateforme (0.5%) pour toutes les entreprises encore sur l'ancien
 * taux par défaut (1.5%). À supprimer une fois la migration effectuée.
 */
export async function POST(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const db = adminDb();
    const snap = await db.collection("companies").where("commissionRate", "==", OLD_RATE).get();

    if (snap.empty) {
      return NextResponse.json({ updated: 0, message: "Aucune entreprise à migrer." });
    }

    const batchSize = 400; // marge sous la limite de 500 écritures/batch Firestore
    const docs = snap.docs;
    let updated = 0;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      for (const doc of docs.slice(i, i + batchSize)) {
        batch.update(doc.ref, { commissionRate: NEW_RATE });
      }
      await batch.commit();
      updated += Math.min(batchSize, docs.length - i);
    }

    return NextResponse.json({ updated, message: `${updated} entreprise(s) migrée(s) vers ${NEW_RATE}.` });
  } catch (err) {
    console.error("migrate-commission-rate:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
