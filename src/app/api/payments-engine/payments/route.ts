import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayment } from "@/lib/joonapay";
import { sendPushAndStore } from "@/lib/push";
import { createPaymentSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Transaction } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { companyId, amount, description, customerName, customerPhone, customerEmail, imageBase64, uid } = parseOrThrow(createPaymentSchema, raw);

    const limited = await checkRateLimit(`payment-create:uid:${uid}`, 60, 3600); // 60 liens / heure / utilisateur
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de liens créés récemment. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;

    // Sécurité : seul un membre réel de l'entreprise peut créer un paiement pour elle
    if (!Array.isArray(company.members) || !company.members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (company.kycStatus !== "approved") {
      return NextResponse.json({ error: "KYC non approuvé pour cette entreprise" }, { status: 403 });
    }
    if (company.suspended === true) {
      return NextResponse.json({ error: "Cette entreprise est actuellement suspendue. Contactez le support." }, { status: 403 });
    }

    // Appel au partenaire de paiement
    const joonaRes = await createJoonapayPayment({
      amount,
      currency: "XOF",
      description: description ?? "Paiement Verzapay",
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/joonapay`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });

    if (!joonaRes.success) {
      return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 502 });
    }

    const commission = Math.round(amount * (company.commissionRate ?? 0.015));
    const netAmount = amount - commission;

    // Enregistrement en DB
    const txRef = db.collection("companies").doc(companyId).collection("transactions").doc();
    const tx: Transaction = {
      id: txRef.id,
      companyId,
      joonapayPaymentId: joonaRes.data?.id ?? null,
      amount,
      currency: "XOF",
      commission,
      netAmount,
      method: "mobile_money",
      status: "pending",
      description: description ?? undefined,
      imageBase64: imageBase64 ?? null,
      customerName: customerName ?? null,
      customerPhone: customerPhone ?? null,
      customerEmail: customerEmail ?? null,
      createdAt: Date.now(),
      completedAt: null,
    };
    await txRef.set(tx);

    // Notification push
    await sendPushAndStore({
      uid,
      companyId,
      title: "Lien de paiement créé",
      body: `Un lien de ${amount.toLocaleString()} XOF a été créé.`,
      type: "payment",
    });

    return NextResponse.json({
      paymentId: txRef.id,
      joonapayId: joonaRes.data?.id,
      checkoutUrl: (joonaRes.data as { checkout_url?: string })?.checkout_url ?? "#",
    });
  } catch (err) {
    console.error("POST /api/joonapay/payments:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue lors de la création du paiement" }, { status: isValidationError ? 400 : 500 });
  }
}
