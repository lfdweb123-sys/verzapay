import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();

    const poSnap = await db.collectionGroup("payouts").orderBy("createdAt", "desc").limit(300).get();
    const payouts = poSnap.docs.map((d) => d.data());

    const companyIds = Array.from(new Set(payouts.map((p) => p.companyId).filter(Boolean)));
    const companyNames: Record<string, string> = {};
    await Promise.all(
      companyIds.map(async (id) => {
        const snap = await db.collection("companies").doc(id).get();
        companyNames[id] = snap.data()?.name ?? "Entreprise inconnue";
      })
    );

    const enriched = payouts.map((p) => ({ ...p, companyName: companyNames[p.companyId] ?? "—" }));

    return NextResponse.json({ payouts: enriched });
  } catch (err) {
    console.error("GET /api/admin/payouts:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
