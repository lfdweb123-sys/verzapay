import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { loadCommissionData } from "@/lib/admin-commissions";

function parsePeriod(req: NextRequest): { from: number; to: number; currency?: string } {
  const sp = req.nextUrl.searchParams;
  const now = Date.now();
  const to = Number(sp.get("to")) || now;
  const from = Number(sp.get("from")) || to - 30 * 24 * 3600 * 1000;
  return { from, to, currency: sp.get("currency") ?? undefined };
}

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const data = await loadCommissionData(parsePeriod(req));
    // Les lignes détaillées ne sont pas renvoyées à l'écran (téléchargement via /report)
    const { rows: _rows, ...summary } = data;
    void _rows;
    return NextResponse.json(summary);
  } catch (err) {
    console.error("GET /api/admin/commissions:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
