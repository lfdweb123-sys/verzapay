import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayout, getJoonapayMisc } from "@/lib/joonapay";
import { resolveCountry, resolvePaymentMethod, findOrCreateEntity } from "@/lib/joonapay-helpers";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { notifyAdmin } from "@/lib/notify-admin";
import { createPayoutSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Payout } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    // NOTE: si tu ajoutes un sélecteur d'opérateur côté front (recommandé quand
    // plusieurs opérateurs sont actifs pour un pays), accepte aussi
    // `recipientOperator` dans createPayoutSchema.
    const { companyId, amount, currency, recipientPhone, recipientName, recipientOperator, note, uid } =
      parseOrThrow(createPayoutSchema, raw);

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

    // ── Résolution pays + opérateur (tous marchés, aucun fallback codé en dur) ─
    const miscRes = await getJoonapayMisc({ transfer_enabled: true });
    const country = resolveCountry(miscRes.data?.countries ?? [], recipientPhone, company.countryCode, {
      requireTransferEnabled: true,
    });

    if (!country) {
      return NextResponse.json(
        { error: "Impossible de déterminer le pays du bénéficiaire à partir du numéro fourni." },
        { status: 400 }
      );
    }

    const methodResolution = resolvePaymentMethod(miscRes.data?.payment_methods ?? [], country.code, {
      requireTransferEnabled: true,
      explicitMethodCode: recipientOperator,
    });

    if (methodResolution.status === "none") {
      return NextResponse.json(
        { error: `Aucun opérateur mobile money actif pour les décaissements en ${country.name}.` },
        { status: 400 }
      );
    }
    if (methodResolution.status === "ambiguous") {
      return NextResponse.json(
        {
          error: "Plusieurs opérateurs mobile money sont disponibles pour ce pays. Précisez l'opérateur du bénéficiaire.",
          options: methodResolution.options.map((m) => ({ code: m.code, name: m.name })),
        },
        { status: 400 }
      );
    }

    const paymentMethod = methodResolution.method;

    // ── Résolution du bénéficiaire JoonaPay (entity_uuid) ───────────────────
    // Recherche par téléphone ; création automatique si inexistant.
    let entity;
    try {
      entity = await findOrCreateEntity({
        phone: recipientPhone,
        name: recipientName?.trim() || "Bénéficiaire Verzapay",
        countryCode: country.code,
        countryUuid: country.uuid,
        paymentMethodUuid: paymentMethod.uuid,
      });
    } catch (entityErr) {
      console.error("findOrCreateEntity:", entityErr);
      return NextResponse.json(
        { error: "Impossible d'enregistrer le bénéficiaire auprès du partenaire de paiement." },
        { status: 502 }
      );
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

    // poRef généré avant l'appel JoonaPay pour servir de merchant_transaction_id
    const poRef = companyRef.collection("payouts").doc();

    let joonaRes;
    try {
      joonaRes = await createJoonapayPayout({
        country_uuid: country.uuid,
        currency: currency ?? country.currency,
        description: note ?? "Reversement Verzapay",
        merchant_transaction_id: poRef.id,
        fee_bearer: "MERCHANT",
        payouts: [
          {
            entity_uuid: entity.uuid,
            amount,
            phone: recipientPhone,
            payment_method_uuid: paymentMethod.uuid,
            description: note ?? undefined,
          },
        ],
      });
    } catch (payoutErr) {
      // Erreur réseau/HTTP (4xx/5xx déjà levée par lib/joonapay.ts) : on recrédite.
      console.error("createJoonapayPayout:", payoutErr);
      await companyRef.update({ walletBalance: newBalance + amount });
      return NextResponse.json({ error: "Erreur lors du décaissement. Votre solde a été recrédité." }, { status: 502 });
    }

    if (!joonaRes.success) {
      await companyRef.update({ walletBalance: newBalance + amount });
      return NextResponse.json({ error: "Erreur lors du décaissement. Votre solde a été recrédité." }, { status: 502 });
    }

    // ── IMPORTANT : la réponse de création est imbriquée dans `payout_group`
    // (contrairement à GET /payouts/{uuid} qui est plate). Voir CreatePayoutResult.
    const payoutGroup = joonaRes.data?.payout_group;
    const joonapayGroupUuid = payoutGroup?.uuid ?? null;

    await companyRef.collection("ledger").add({
      type: "debit",
      amount,
      balanceAfter: newBalance,
      reference: joonapayGroupUuid ?? "manual",
      label: `Retrait → ${recipientPhone}`,
      createdAt: Date.now(),
    });

    const payout: Payout = {
      id: poRef.id,
      companyId,
      joonapayPayoutId: joonapayGroupUuid,
      amount,
      currency: country.currency,
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
      body: `${amount.toLocaleString()} ${country.currency} envoyés vers ${recipientPhone}`,
      type: "payout",
    });

    const userSnap = await db.collection("users").doc(uid).get();
    const userEmail = userSnap.data()?.email;
    if (userEmail) {
      await sendTransactionalEmail({
        to: [{ email: userEmail, name: userSnap.data()?.displayName }],
        subject: `Décaissement de ${amount.toLocaleString()} ${country.currency} initié`,
        htmlContent: emailTemplate({
          title: "Décaissement initié",
          body: `Votre demande de décaissement de <strong>${amount.toLocaleString()} ${country.currency}</strong> vers <strong>${recipientPhone}</strong> est en cours de traitement.`,
          ctaLabel: "Voir le tableau de bord",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payouts`,
        }),
      });
    }

    await notifyAdmin({
      title: `Demande de retrait — ${amount.toLocaleString()} ${country.currency}`,
      body: `L'entreprise <strong>${company.name}</strong> a demandé un décaissement de <strong>${amount.toLocaleString()} ${country.currency}</strong> vers ${recipientPhone}.`,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    });

    return NextResponse.json({ payoutId: poRef.id, joonapayId: joonapayGroupUuid });
  } catch (err) {
    console.error("POST /api/joonapay/payouts:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}