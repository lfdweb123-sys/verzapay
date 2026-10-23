import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getJoonapayBalance } from "@/lib/joonapay";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid manquant" }, { status: 400 });

    if (!(await requireAdmin(uid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const res = await getJoonapayBalance();
    if (!res.success) {
      return NextResponse.json({ error: "Erreur JoonaPay" }, { status: 502 });
    }

    return NextResponse.json({ balances: res.data ?? [] });
  } catch (err) {
    console.error("GET /api/admin/joonapay-balance:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}