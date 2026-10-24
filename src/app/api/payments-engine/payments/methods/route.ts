import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getJoonapayMisc } from "@/lib/joonapay";
import { verifyRequestUid } from "@/lib/auth-token";

const CHANNEL_NAMES: Record<string, string> = {
  MOBILE_MONEY: "Mobile Money",
  CREDIT_CARD: "Carte bancaire",
  BANK_TRANSFER: "Virement bancaire",
};

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

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
      // Libellé générique par type de méthode (jamais le nom d'un opérateur précis)
      .map((m: { channel: string }) => ({ channel: m.channel, name: CHANNEL_NAMES[m.channel] ?? m.channel }));

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