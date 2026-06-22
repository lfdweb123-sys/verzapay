import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayout } from "@/lib/joonapay";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { notifyAdmin } from "@/lib/notify-admin";
import { createPayoutSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Payout } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { companyId, amount, currency, recipientPhone, recipientName, note, uid } = parseOrThrow(createPayoutSchema, raw);

    const limited = await checkRateLimit(`payout:uid:${uid}`, 10, 3600); // 10 demandes / heure / utilisateur
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de demandes de retrait. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;

    if (!Array.isArray(company.members) || !company.members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (company.kycStatus !== "approved") {
      return NextResponse.json({ error: "KYC non approuvé" }, { status: 403 });
    }
    if (company.suspended === true) {
      return NextResponse.json({ error: "Cette entreprise est suspendue. Les retraits sont désactivés. Contactez le support." }, { status: 403 });
    }

    let newBalance = 0;
    try {
      newBalance = await db.runTransaction(async (tx) => {
        const freshSnap = await tx.get(companyRef);
        const freshBalance = freshSnap.data()?.walletBalance ?? 0;
        if (freshBalance < amount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }
        const updated = freshBalance - amount;
        tx.update(companyRef, { walletBalance: updated });
        return updated;
      });
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === "INSUFFICIENT_BALANCE") {
        return NextResponse.json({ error: "Solde insuffisant" }, { status: 400 });
      }
      throw txErr;
    }

    const joonaRes = await createJoonapayPayout({
      amount,
      currency: currency ?? "XOF",
      recipient_phone: recipientPhone,
      payment_method: "mobile_money",
      description: note ?? "Reversement Verzapay",
    });

    if (!joonaRes.success) {
      await companyRef.update({ walletBalance: newBalance + amount });
      return NextResponse.json({ error: "Erreur lors du décaissement. Votre solde a été recrédité." }, { status: 502 });
    }

    await companyRef.collection("ledger").add({
      type: "debit",
      amount,
      balanceAfter: newBalance,
      reference: joonaRes.data?.id ?? "manual",
      label: `Retrait → ${recipientPhone}`,
      createdAt: Date.now(),
    });

    const poRef = companyRef.collection("payouts").doc();
    const payout: Payout = {
      id: poRef.id,
      companyId,
      joonapayPayoutId: joonaRes.data?.id ?? null,
      amount,
      currency: "XOF",
      method: "mobile_money",
      recipientPhone,
      recipientName: recipientName ?? null,
      status: "processing",
      requestedBy: uid,
      approvedBy: null,
      createdAt: Date.now(),
      processedAt: null,
      note: note ?? null,
    };
    await poRef.set(payout);

    await sendPushAndStore({
      uid,
      companyId,
      title: "Décaissement en cours",
      body: `${amount.toLocaleString()} XOF envoyés vers ${recipientPhone}`,
      type: "payout",
    });

    const userSnap = await db.collection("users").doc(uid).get();
    const userEmail = userSnap.data()?.email;
    if (userEmail) {
      await sendTransactionalEmail({
        to: [{ email: userEmail, name: userSnap.data()?.displayName }],
        subject: `Décaissement de ${amount.toLocaleString()} XOF initié`,
        htmlContent: emailTemplate({
          title: "Décaissement initié",
          body: `Votre demande de décaissement de <strong>${amount.toLocaleString()} XOF</strong> vers <strong>${recipientPhone}</strong> est en cours de traitement.`,
          ctaLabel: "Voir le tableau de bord",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payouts`,
        }),
      });
    }

    await notifyAdmin({
      title: `Demande de retrait — ${amount.toLocaleString()} XOF`,
      body: `L'entreprise <strong>${company.name}</strong> a demandé un décaissement de <strong>${amount.toLocaleString()} XOF</strong> vers ${recipientPhone}.`,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    });

    return NextResponse.json({ payoutId: poRef.id, joonapayId: joonaRes.data?.id });
  } catch (err) {
    console.error("POST /api/joonapay/payouts:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
