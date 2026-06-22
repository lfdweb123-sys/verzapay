import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();

    const txSnap = await db.collectionGroup("transactions").orderBy("createdAt", "desc").limit(300).get();
    const transactions = txSnap.docs.map((d) => d.data());

    const companyIds = Array.from(new Set(transactions.map((t) => t.companyId).filter(Boolean)));
    const companyNames: Record<string, string> = {};
    await Promise.all(
      companyIds.map(async (id) => {
        const snap = await db.collection("companies").doc(id).get();
        companyNames[id] = snap.data()?.name ?? "Entreprise inconnue";
      })
    );

    const enriched = transactions.map((t) => ({ ...t, companyName: companyNames[t.companyId] ?? "—" }));

    return NextResponse.json({ transactions: enriched });
  } catch (err) {
    console.error("GET /api/admin/transactions:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
