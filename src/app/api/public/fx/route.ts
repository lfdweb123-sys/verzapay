import { NextResponse } from "next/server";
import { publicRatesPerXof } from "@/lib/fx";

// Taux publics (unités de chaque devise pour 1 XOF) — utilisés par l'affichage du dashboard.
export const dynamic = "force-dynamic"; // jamais pré-rendu au build : mis en cache via Cache-Control (1 h)

export async function GET() {
  try {
    return NextResponse.json(await publicRatesPerXof(), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    console.error("GET /api/public/fx:", err);
    return NextResponse.json({ error: "Taux de change indisponibles." }, { status: 503 });
  }
}
