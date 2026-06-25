import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getJoonapayMisc } from "@/lib/joonapay";

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const uid = req.nextUrl.searchParams.get("uid");
    if (!companyId || !uid) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    const company = companySnap.data()!;
    if (!company.members?.includes(uid)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const miscRes = await getJoonapayMisc({ payment_enabled: true });
    const methods = miscRes.data?.payment_methods ?? [];

    // Retourner les channels uniques disponibles pour le pays de l'entreprise
    const countryCode = company.countryCode ?? "BJ";
    const available = methods
      .filter((m: { payment_status: string; country: { code: string } }) =>
        m.payment_status === "active" && m.country.code === countryCode
      )
      .map((m: { channel: string; name: string }) => ({ channel: m.channel, name: m.name }));

    // Dédoublonner par channel
    const seen = new Set<string>();
    const unique = available.filter((m: { channel: string }) => {
      if (seen.has(m.channel)) return false;
      seen.add(m.channel);
      return true;
    });

    return NextResponse.json({ methods: unique, countryCode });
  } catch (err) {
    console.error("GET /api/payments-engine/methods:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}