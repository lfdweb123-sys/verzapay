import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const LOG_PREFIX = "[AdminReconciled]";

// ⚠️ ADAPTE CETTE VÉRIFICATION pour qu'elle corresponde exactement à celle
// utilisée dans /api/admin/stats (je n'ai pas vu ce fichier). Remplace ce bloc
// par ton import existant si tu as déjà un helper du type `requireAdmin(uid)`.
async function isAdminUid(uid: string | null): Promise<boolean> {
  if (!uid) return false;
  const db = adminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  return userSnap.exists && userSnap.data()?.role === "admin";
}

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await isAdminUid(uid))) {
      console.warn(`${LOG_PREFIX} Accès refusé pour uid=${uid}`);
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const daysParam = req.nextUrl.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    console.log(`${LOG_PREFIX} Recherche des transactions réconciliées manuellement depuis ${new Date(cutoff).toISOString()}`);

    const db = adminDb();
    const snap = await db
      .collectionGroup("transactions")
      .where("reconciledManually", "==", true)
      .where("completedAt", ">=", cutoff)
      .orderBy("completedAt", "desc")
      .limit(200)
      .get();

    console.log(`${LOG_PREFIX} ${snap.size} transaction(s) réconciliée(s) trouvée(s)`);

    // On récupère les noms d'entreprise en une passe pour éviter N+1 lectures répétées
    const companyIds = [...new Set(snap.docs.map((d) => d.data().companyId).filter(Boolean))];
    const companyNames: Record<string, string> = {};

    await Promise.all(
      companyIds.map(async (cid) => {
        const cSnap = await db.collection("companies").doc(cid).get();
        companyNames[cid] = cSnap.data()?.name ?? cid;
      })
    );

    const items = snap.docs.map((doc) => {
      const tx = doc.data();
      return {
        id: doc.id,
        companyId: tx.companyId,
        companyName: companyNames[tx.companyId] ?? tx.companyId,
        amount: tx.amount,
        netAmount: tx.netAmount,
        currency: tx.currency ?? "XOF",
        customerName: tx.customerName ?? null,
        customerPhone: tx.customerPhone ?? null,
        joonapayPaymentId: tx.joonapayPaymentId ?? null,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
        // Temps écoulé entre création et déblocage manuel — utile pour voir
        // combien de temps un marchand est resté bloqué avant la réconciliation.
        delayMs: tx.completedAt && tx.createdAt ? tx.completedAt - tx.createdAt : null,
      };
    });

    const totalAmount = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);

    return NextResponse.json({
      items,
      count: items.length,
      totalAmount,
      days,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur:`, err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}