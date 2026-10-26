import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { getJoonapayMisc } from "@/lib/joonapay";
import { processJoonapayPayment, ProcessError } from "@/lib/joonapay-checkout";
import { groupMethods, isAttemptLocked, isValidTokenShape, toE164 } from "@/lib/checkout";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  method: z.enum(["MOBILE_MONEY", "CARD", "BANK_TRANSFER"]),
  operatorCode: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  otp: z.string().max(12).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!isValidTokenShape(token)) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const [byIp, byToken] = await Promise.all([
      checkRateLimit(`checkout-pay-ip:${ip}`, 20, 600),
      checkRateLimit(`checkout-pay:${token}`, 10, 600),
    ]);
    if (!byIp.allowed || !byToken.allowed) return NextResponse.json({ error: "Trop de tentatives. Patientez quelques minutes." }, { status: 429 });

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const input = parsed.data;

    const db = adminDb();
    const sessionRef = db.collection("checkoutSessions").doc(token);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    const session = sessionSnap.data()!;

    if (Date.now() > session.expiresAt) return NextResponse.json({ error: "Ce lien de paiement a expiré." }, { status: 410 });

    const txSnap = await db.collection("companies").doc(session.companyId).collection("transactions").doc(session.txId).get();
    if (txSnap.data()?.status === "completed") return NextResponse.json({ error: "Ce paiement a déjà été effectué." }, { status: 409 });

    const misc = await getJoonapayMisc({ payment_enabled: true });
    const country = misc.data?.countries?.find((c) => session.customerPhone.startsWith(c.indicator.startsWith("+") ? c.indicator : `+${c.indicator}`));
    if (!country) return NextResponse.json({ error: "Pays du paiement introuvable" }, { status: 400 });
    const groups = groupMethods(misc.data.payment_methods, country.code);

    // ── Carte / virement : redirection vers la page de paiement du partenaire (lien existant, jamais fabriqué)
    if (input.method === "CARD" || input.method === "BANK_TRANSFER") {
      if ((input.method === "CARD" && !groups.card) || (input.method === "BANK_TRANSFER" && !groups.bank)) {
        return NextResponse.json({ error: "Ce moyen de paiement n'est pas disponible." }, { status: 400 });
      }
      if (isAttemptLocked(session.attempt, Date.now()) && session.attempt?.method === "MOBILE_MONEY") {
        return NextResponse.json({ error: "Un paiement Mobile Money est déjà en cours." }, { status: 409 });
      }
      const link: string | undefined = session.paymentLink;
      if (!link || !link.startsWith("https://")) return NextResponse.json({ error: "Lien de paiement indisponible" }, { status: 502 });
      return NextResponse.json({ redirectUrl: link });
    }

    // ── Mobile Money : débit initié depuis nos serveurs
    const operator = misc.data.payment_methods.find(
      (m) => m.country.code === country.code && m.channel === "MOBILE_MONEY" && m.payment_status === "active" && m.code === input.operatorCode
    );
    if (!operator) return NextResponse.json({ error: "Choisissez un opérateur disponible." }, { status: 400 });
    const phone = input.phone ? toE164(country.indicator, input.phone) : null;
    if (!phone) return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 });

    // Verrou atomique : empêche deux débits simultanés (double clic, deux onglets)
    const attemptId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const locked = await db.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (isAttemptLocked(snap.data()?.attempt, Date.now())) return false;
      tx.update(sessionRef, { attempt: { id: attemptId, method: "MOBILE_MONEY", status: "initiating", at: Date.now(), phoneLast4: phone.slice(-4) } });
      return true;
    });
    if (!locked) return NextResponse.json({ error: "Un paiement est déjà en cours. Confirmez-le sur votre téléphone." }, { status: 409 });

    try {
      await processJoonapayPayment(session.joonapayUuid, {
        payment_method_uuid: operator.uuid,
        phone,
        ...(input.otp ? { payment_mode: "OTP" as const, otp: input.otp } : {}),
        customer_name: session.customerName || undefined,
      });
      await sessionRef.update({ "attempt.status": "pending", "attempt.at": Date.now() });
      return NextResponse.json({ state: "pending" });
    } catch (err) {
      await sessionRef.update({ "attempt.status": "failed" });
      const raw = err instanceof ProcessError ? err.raw : "";
      console.error("checkout process error:", raw || err);
      if (/otp/i.test(raw) && !input.otp) {
        return NextResponse.json({ error: "Saisissez le code de confirmation reçu de votre opérateur.", needsOtp: true }, { status: 422 });
      }
      return NextResponse.json({ error: "Le paiement n'a pas pu être initié. Vérifiez votre numéro et réessayez." }, { status: 422 });
    }
  } catch (err) {
    console.error("POST /api/checkout/[token]/pay:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
