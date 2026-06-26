import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

const LOG_PREFIX = "[AdminReconciled]";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const daysParam = req.nextUrl.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    console.log(`${LOG_PREFIX} Recherche des transactions réconciliées manuellement depuis ${new Date(cutoff).toISOString()}`);

    const db = adminDb();

    // Même pattern que /api/admin/stats : on évite le where composite sur
    // collectionGroup (qui demanderait un index dédié) en filtrant en mémoire
    // après un orderBy simple, limité à 5000 docs.
    let txSnap;
    try {
      txSnap = await db
        .collectionGroup("transactions")
        .orderBy("completedAt", "desc")
        .limit(5000)
        .get();
    } catch (indexErr) {
      console.error(`${LOG_PREFIX} Index collectionGroup manquant:`, indexErr);
      return NextResponse.json({
        items: [],
        count: 0,
        totalAmount: 0,
        days,
        warning: "Index collectionGroup manquant — créez-le dans la console Firebase",
      });
    }

    const filtered = txSnap.docs.filter((d) => {
      const tx = d.data();
      return tx.reconciledManually === true && (tx.completedAt ?? 0) >= cutoff;
    });

    console.log(`${LOG_PREFIX} ${filtered.length} transaction(s) réconciliée(s) trouvée(s) sur ${txSnap.size} scannées`);

    // On récupère les noms d'entreprise en une passe pour éviter N+1 lectures répétées
    const companyIds = [...new Set(filtered.map((d) => d.data().companyId).filter(Boolean))];
    const companyNames: Record<string, string> = {};

    await Promise.all(
      companyIds.map(async (cid) => {
        const cSnap = await db.collection("companies").doc(cid).get();
        companyNames[cid] = cSnap.data()?.name ?? cid;
      })
    );

    const items = filtered.map((doc) => {
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
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}