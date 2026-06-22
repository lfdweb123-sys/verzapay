import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();

    const txSnap = await db
      .collectionGroup("transactions")
      .where("status", "==", "completed")
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get();

    const companyNames: Record<string, string> = {};
    const customersMap = new Map<
      string,
      { key: string; name: string; phone: string | null; email: string | null; totalSpent: number; transactionsCount: number; companies: Set<string> }
    >();

    for (const docSnap of txSnap.docs) {
      const tx = docSnap.data();
      const key = tx.customerPhone || tx.customerEmail || tx.customerName || docSnap.id;
      const existing = customersMap.get(key);
      if (existing) {
        existing.totalSpent += tx.amount ?? 0;
        existing.transactionsCount += 1;
        existing.companies.add(tx.companyId);
      } else {
        customersMap.set(key, {
          key,
          name: tx.customerName ?? "Client",
          phone: tx.customerPhone ?? null,
          email: tx.customerEmail ?? null,
          totalSpent: tx.amount ?? 0,
          transactionsCount: 1,
          companies: new Set([tx.companyId]),
        });
      }
      if (!companyNames[tx.companyId]) companyNames[tx.companyId] = "";
    }

    await Promise.all(
      Object.keys(companyNames).map(async (id) => {
        const snap = await db.collection("companies").doc(id).get();
        companyNames[id] = snap.data()?.name ?? "Entreprise inconnue";
      })
    );

    const customers = Array.from(customersMap.values())
      .map((c) => ({ ...c, companies: Array.from(c.companies).map((id) => companyNames[id] ?? "—") }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    return NextResponse.json({ customers });
  } catch (err) {
    console.error("GET /api/admin/customers:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
