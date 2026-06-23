import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();

    const companiesSnap = await db.collection("companies").get();
    const companies = companiesSnap.docs.map((d) => d.data());

    const totalCompanies = companies.length;
    const approvedCompanies = companies.filter((c) => c.kycStatus === "approved").length;
    const pendingKyc = companies.filter((c) => c.kycStatus === "pending" || c.kycStatus === "review").length;
    const suspendedCompanies = companies.filter((c) => c.suspended === true).length;
    const totalWalletBalance = companies.reduce((s, c) => s + (c.walletBalance ?? 0), 0);

    // collectionGroup sans filtre de date — évite l'index composite manquant
    // On filtre en mémoire après, limite 5000 docs max
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    let txSnap;
    try {
      txSnap = await db
        .collectionGroup("transactions")
        .orderBy("createdAt", "desc")
        .limit(5000)
        .get();
    } catch (indexErr) {
      // Si l'index collectionGroup n'existe pas encore, on renvoie les stats partielles
      console.error("collectionGroup index manquant:", indexErr);
      return NextResponse.json({
        totalCompanies,
        approvedCompanies,
        pendingKyc,
        suspendedCompanies,
        totalWalletBalance,
        totalVolume30d: 0,
        totalCommission30d: 0,
        successRate: 0,
        transactionsCount30d: 0,
        warning: "Index collectionGroup manquant — créez-le dans la console Firebase",
      });
    }

    let totalVolume30d = 0;
    let totalCommission30d = 0;
    let completedCount = 0;
    let totalCount = 0;

    txSnap.docs.forEach((d) => {
      const tx = d.data();
      // Filtre 30j en mémoire
      if ((tx.createdAt ?? 0) < thirtyDaysAgo) return;
      totalCount++;
      if (tx.status === "completed") {
        completedCount++;
        totalVolume30d += tx.amount ?? 0;
        totalCommission30d += tx.commission ?? 0;
      }
    });

    const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return NextResponse.json({
      totalCompanies,
      approvedCompanies,
      pendingKyc,
      suspendedCompanies,
      totalWalletBalance,
      totalVolume30d,
      totalCommission30d,
      successRate,
      transactionsCount30d: totalCount,
    });
  } catch (err) {
    console.error("GET /api/admin/stats:", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}