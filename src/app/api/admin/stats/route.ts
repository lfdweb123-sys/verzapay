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

    // Agrégation transactions (collectionGroup) des 30 derniers jours pour le volume
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const txSnap = await db
      .collectionGroup("transactions")
      .where("createdAt", ">=", thirtyDaysAgo)
      .limit(2000)
      .get();

    let totalVolume30d = 0;
    let totalCommission30d = 0;
    let completedCount = 0;
    let totalCount = 0;

    txSnap.docs.forEach((d) => {
      const tx = d.data();
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
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
