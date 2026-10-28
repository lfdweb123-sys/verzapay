import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getJoonapayMisc } from "@/lib/joonapay";
import { groupMethods, isValidTokenShape } from "@/lib/checkout";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSessionByToken } from "@/lib/checkout-session";

// Données PUBLIQUES minimales nécessaires à l'affichage du checkout (jamais d'identifiant interne,
// de clé, ni de lien du partenaire).
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!isValidTokenShape(token)) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limited = await checkRateLimit(`checkout-get:${ip}`, 120, 60);
    if (!limited.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

    const db = adminDb();
    const found = await getSessionByToken(db, token);
    if (!found) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    const session = found.data;

    const [txSnap, companySnap] = await Promise.all([
      db.collection("companies").doc(session.companyId).collection("transactions").doc(session.txId).get(),
      db.collection("companies").doc(session.companyId).get(),
    ]);
    const tx = txSnap.data();
    if (!tx) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });

    const misc = await getJoonapayMisc({ payment_enabled: true });
    const country = misc.data?.countries?.find((c) => c.currency && tx.chargeCurrency && c.payment_enabled && session.customerPhone.startsWith(c.indicator.startsWith("+") ? c.indicator : `+${c.indicator}`));
    const methods = country ? groupMethods(misc.data.payment_methods, country.code) : { mobileMoney: [], card: false, bank: false };

    const expired = Date.now() > session.expiresAt;
    const total = Number(tx.chargeAmount ?? tx.amount);
    const fee = Number(tx.customerFee ?? 0);

    return NextResponse.json({
      businessName: companySnap.data()?.name ?? "Verzapay",
      reference: `VPZ-${String(session.txId).slice(0, 8).toUpperCase()}`,
      description: session.description || "Paiement",
      currency: tx.chargeCurrency ?? "XOF",
      subtotal: total - fee,
      fee,
      total,
      country: country ? { code: country.code, name: country.name, indicator: country.indicator } : null,
      methods,
      customerPhone: session.customerPhone,
      alreadyPaid: tx.status === "completed" || session.paid === true,
      expired,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/checkout/[token]:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
