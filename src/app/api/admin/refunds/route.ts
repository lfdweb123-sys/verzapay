import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const db = adminDb();
    const snap = await db.collection("refunds").limit(500).get();
    const refunds = snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt);
    const ids = Array.from(new Set(refunds.map((r) => r.companyId as string)));
    const names: Record<string, string> = {};
    if (ids.length) (await db.getAll(...ids.map((id) => db.collection("companies").doc(id)))).forEach((s) => { names[s.id] = String(s.data()?.name ?? s.id); });
    return NextResponse.json({ refunds: refunds.map((r) => ({ ...r, companyName: names[r.companyId] ?? "—" })) });
  } catch (err) {
    console.error("GET /api/admin/refunds:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
