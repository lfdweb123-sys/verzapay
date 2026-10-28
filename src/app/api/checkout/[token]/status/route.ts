import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getJoonapayPayment } from "@/lib/joonapay";
import { isValidTokenShape, mapPaymentState } from "@/lib/checkout";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSessionByToken, markSessionPaid } from "@/lib/checkout-session";

// Statut FIABLE : lu côté serveur auprès du partenaire. Une simple redirection (?r=success) ne prouve rien.
// Cette route ne crédite JAMAIS le portefeuille : seul le webhook signé existant le fait.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!isValidTokenShape(token)) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limited = await checkRateLimit(`checkout-status:${ip}`, 90, 60);
    if (!limited.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

    const db = adminDb();
    const found = await getSessionByToken(db, token);
    if (!found) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    const sessionRef = found.ref;
    const session = found.data;

    const txSnap = await db.collection("companies").doc(session.companyId).collection("transactions").doc(session.txId).get();
    const txStatus = txSnap.data()?.status;
    if (session.paid === true) return NextResponse.json({ state: "success", canRetry: false, verified: true });

    try {
      const detail = await getJoonapayPayment(session.joonapayUuid);
      const result = mapPaymentState(detail.data);
      if (result.state === "success" && session.paid !== true) await markSessionPaid(db, session.txId);
      if (result.state === "failed" && result.canRetry && session.attempt?.status !== "failed") {
        await sessionRef.update({ "attempt.status": "failed" }); // libère le verrou : nouvelle tentative autorisée
      }
      return NextResponse.json({ ...result, verified: true }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // Partenaire injoignable : on ne s'appuie que sur le statut déjà confirmé par le webhook signé
      if (txStatus === "completed") return NextResponse.json({ state: "success", canRetry: false, verified: true });
      return NextResponse.json({ state: "pending", canRetry: false, verified: false });
    }
  } catch (err) {
    console.error("GET /api/checkout/[token]/status:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
