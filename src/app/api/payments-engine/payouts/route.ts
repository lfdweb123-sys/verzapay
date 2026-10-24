import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayout, getJoonapayMisc } from "@/lib/joonapay";
import { resolveCountry, resolvePaymentMethod, matchOperatorByName, findOrCreateEntity } from "@/lib/joonapay-helpers";
import { beneficiaryKey, type StoredBeneficiary } from "@/lib/beneficiaries";
import { maskPhone, maskAccount } from "@/lib/mask";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { notifyAdmin } from "@/lib/notify-admin";
import { createPayoutSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { planCharge, planFields } from "@/lib/charge";
import { FxError } from "@/lib/fx";
import type { Payout } from "@/types";
import { verifyRequestUid } from "@/lib/auth-token";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();

    // Bénéficiaire enregistré : on reprend ses VRAIES coordonnées côté serveur (le navigateur
    // n'en reçoit jamais que la version masquée).
    if (typeof raw?.beneficiaryId === "string" && raw.beneficiaryId) {
      if (!(await verifyRequestUid(raw.uid))) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
      }
      const cRef = adminDb().collection("companies").doc(String(raw.companyId));
      const cData = (await cRef.get()).data();
      if (!Array.isArray(cData?.members) || !cData.members.includes(raw.uid)) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
      const bSnap = await cRef.collection("beneficiaries").doc(raw.beneficiaryId).get();
      if (!bSnap.exists) return NextResponse.json({ error: "Bénéficiaire introuvable" }, { status: 404 });
      const saved = bSnap.data() as StoredBeneficiary;
      raw.recipientPhone = saved.phone;
      raw.recipientName = saved.name;
      raw.recipientOperator = saved.operator ?? undefined;
      raw.method = saved.type;
      raw.bank = saved.bank ?? undefined;
    }
    const { companyId, amount, currency, recipientPhone, recipientName, note, uid, method, bank } =
      parseOrThrow(createPayoutSchema, raw);
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // NOTE: `recipientOperator` n'est pas (encore) déclaré dans createPayoutSchema,
    // donc il n'est pas validé par parseOrThrow. On le lit directement depuis le
    // payload brut en attendant la mise à jour du schéma. À terme, ajoute
    // `recipientOperator` dans createPayoutSchema puis remonte-le dans la
    // déstructuration ci-dessus pour bénéficier de la validation Zod/Yup.
    const recipientOperator: string | undefined =
      typeof raw?.recipientOperator === "string" ? raw.recipientOperator : undefined;

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

    // ── Virement bancaire : TOUJOURS MANUEL ──────────────────────────────────
    // Aucun envoi automatique : la demande est enregistrée, le montant est réservé sur le
    // portefeuille, puis l'équipe Verzapay effectue le virement et le marque comme payé
    // (ou le rejette, ce qui rembourse le portefeuille) depuis l'espace admin.
    if (method === "bank_transfer") {
      if (!bank) {
        return NextResponse.json({ error: "Les coordonnées bancaires du bénéficiaire sont requises." }, { status: 400 });
      }
      if (!bank.iban && !bank.accountNumber) {
        return NextResponse.json({ error: "Renseignez l'IBAN ou le numéro de compte du bénéficiaire." }, { status: 400 });
      }

      const cur = String(currency ?? "XOF").toUpperCase();
      const plan = await planCharge({ amount, currency: cur, targetCurrency: cur, minLedger: 500, maxLedger: 50_000_000 });
      const ledger = plan.ledgerAmount;

      let newBalance = 0;
      try {
        newBalance = await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(companyRef);
          const freshBalance = freshSnap.data()?.walletBalance ?? 0;
          if (freshBalance < ledger) throw new Error("INSUFFICIENT_BALANCE");
          const updated = freshBalance - ledger;
          tx.update(companyRef, { walletBalance: updated });
          return updated;
        });
      } catch (txErr) {
        if (txErr instanceof Error && txErr.message === "INSUFFICIENT_BALANCE") {
          return NextResponse.json({ error: "Solde insuffisant" }, { status: 400 });
        }
        throw txErr;
      }

      const poRef = companyRef.collection("payouts").doc();
      await companyRef.collection("ledger").add({
        type: "debit",
        amount: ledger,
        balanceAfter: newBalance,
        reference: poRef.id,
        label: `Virement bancaire (traitement manuel) → ${bank.bankName}`,
        createdAt: Date.now(),
      });

      const manualPayout: Payout = {
        id: poRef.id,
        companyId,
        joonapayPayoutId: null,
        amount: ledger,
        currency: "XOF",
        ...planFields(plan),
        method: "bank_transfer",
        manual: true,
        recipientPhone,
        recipientName: recipientName ?? bank.accountHolderName,
        recipientBank: bank.bankName,
        recipientAccountLast4: (bank.iban ?? bank.accountNumber ?? "").slice(-4) || null,
        // Le document est lisible par les membres : seules des valeurs MASQUÉES y figurent.
        // Les coordonnées complètes sont dans payoutSecrets (illisible depuis le navigateur).
        bankDetails: {
          bankName: bank.bankName,
          accountHolderName: bank.accountHolderName,
          iban: bank.iban ? maskAccount(bank.iban) : null,
          bicSwift: bank.bicSwift ? maskAccount(bank.bicSwift) : null,
          accountNumber: bank.accountNumber ? maskAccount(bank.accountNumber) : null,
        },
        status: "pending",
        requestedBy: uid,
        approvedBy: null,
        createdAt: Date.now(),
        processedAt: null,
        note: note ?? null,
      };
      await poRef.set(manualPayout);
      await companyRef.collection("payoutSecrets").doc(poRef.id).set({
        bankDetails: {
          bankName: bank.bankName,
          accountHolderName: bank.accountHolderName,
          iban: bank.iban ?? null,
          bicSwift: bank.bicSwift ?? null,
          accountNumber: bank.accountNumber ?? null,
        },
        recipientPhone,
        createdAt: Date.now(),
      });

      // Mémorisation du bénéficiaire pour les prochains retraits (non bloquant)
      try {
        const toSave: StoredBeneficiary = {
          type: "bank_transfer",
          name: recipientName?.trim() || bank.accountHolderName,
          phone: recipientPhone,
          operator: null,
          bank: {
            bankName: bank.bankName,
            accountHolderName: bank.accountHolderName,
            iban: bank.iban ?? null,
            bicSwift: bank.bicSwift ?? null,
            accountNumber: bank.accountNumber ?? null,
          },
          updatedAt: Date.now(),
        };
        await companyRef.collection("beneficiaries").doc(beneficiaryKey(toSave)).set(toSave, { merge: true });
      } catch (benErr) {
        console.error("beneficiary save (non bloquant):", benErr);
      }

      const amountLabel = `${plan.requestedAmount.toLocaleString("fr-FR")} ${plan.requestedCurrency}`;

      await sendPushAndStore({
        uid, companyId,
        title: "Virement bancaire en attente",
        body: `Votre demande de virement de ${amountLabel} vers ${bank.bankName} sera traitée manuellement par notre équipe.`,
        type: "payout",
      });

      const requester = (await db.collection("users").doc(uid).get()).data();
      if (requester?.email) {
        await sendTransactionalEmail({
          to: [{ email: requester.email, name: requester.displayName }],
          subject: `Virement bancaire de ${amountLabel} enregistré`,
          htmlContent: emailTemplate({
            title: "Virement bancaire enregistré",
            body: `Votre demande de virement de <strong>${amountLabel}</strong> vers <strong>${bank.bankName}</strong> a bien été enregistrée. Les virements bancaires sont <strong>traités manuellement</strong> par notre équipe : vous serez notifié dès qu'il sera effectué. Le montant est déjà réservé sur votre portefeuille.`,
            ctaLabel: "Voir mes décaissements",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payouts`,
          }),
        });
      }

      await notifyAdmin({
        title: `Virement bancaire à effectuer — ${amountLabel}`,
        body: [
          `<strong>Entreprise :</strong> ${company.name}`,
          `<strong>Bénéficiaire :</strong> ${bank.accountHolderName}`,
          `<strong>Banque :</strong> ${bank.bankName}`,
          bank.iban ? `<strong>IBAN :</strong> ${bank.iban}` : "",
          bank.accountNumber ? `<strong>N° de compte :</strong> ${bank.accountNumber}` : "",
          bank.bicSwift ? `<strong>BIC/SWIFT :</strong> ${bank.bicSwift}` : "",
          `<strong>Montant :</strong> ${amountLabel}`,
          `<br/>À traiter manuellement, puis marquer « payé » dans Admin > Paiements sortants.`,
        ].filter(Boolean).join("<br/>"),
        ctaLabel: "Ouvrir l'admin",
        ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/payouts`,
      });

      return NextResponse.json({ payoutId: poRef.id, manual: true });
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

    // Le réseau (ex. "Moov BJ", "MTN BJ") est saisi librement par l'utilisateur.
    const allMethods = miscRes.data?.payment_methods ?? [];
    const methodResolution = recipientOperator?.trim()
      ? matchOperatorByName(allMethods, country.code, recipientOperator.trim(), { requireTransferEnabled: true })
      : resolvePaymentMethod(allMethods, country.code, { requireTransferEnabled: true });

    if (methodResolution.status === "none") {
      const available = allMethods
        .filter((m) => m.country.code === country.code && m.channel === "MOBILE_MONEY" && m.transfer_status === "active")
        .map((m) => m.name);
      return NextResponse.json(
        {
          error: recipientOperator?.trim()
            ? `Réseau « ${recipientOperator.trim()} » non reconnu pour ${country.name}. Réseaux disponibles : ${available.join(", ") || "aucun"}.`
            : `Aucun opérateur mobile money actif pour les décaissements en ${country.name}.`,
        },
        { status: 400 }
      );
    }
    if (methodResolution.status === "ambiguous") {
      return NextResponse.json(
        {
          error: `Plusieurs réseaux correspondent. Précisez le réseau du bénéficiaire (ex. ${methodResolution.options.slice(0, 3).map((m) => m.name).join(", ")}).`,
          options: methodResolution.options.map((m) => ({ code: m.code, name: m.name })),
        },
        { status: 400 }
      );
    }

    const paymentMethod = methodResolution.method;

    // Conversion : montant saisi (devise choisie, défaut XOF) -> devise du pays du bénéficiaire (versement) et -> XOF (débit du wallet).
    const plan = await planCharge({ amount, currency, targetCurrency: country.currency, minLedger: 500, maxLedger: 50_000_000 });
    const ledger = plan.ledgerAmount;

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
        if (freshBalance < ledger) {
          throw new Error("INSUFFICIENT_BALANCE");
        }
        const updated = freshBalance - ledger;
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
        currency: plan.chargeCurrency,
        description: note ?? "Reversement Verzapay",
        merchant_transaction_id: poRef.id,
        fee_bearer: (company.feesPayout ?? "MERCHANT") as "MERCHANT" | "CUSTOMER",
        payouts: [
          {
            entity_uuid: entity.uuid,
            amount: plan.chargeAmount,
            phone: recipientPhone,
            payment_method_uuid: paymentMethod.uuid,
            description: note ?? undefined,
          },
        ],
      });
    } catch (payoutErr) {
      // Erreur réseau/HTTP (4xx/5xx déjà levée par lib/joonapay.ts) : on recrédite.
      console.error("createJoonapayPayout:", payoutErr);
      await companyRef.update({ walletBalance: newBalance + ledger });
      return NextResponse.json({ error: "Erreur lors du décaissement. Votre solde a été recrédité." }, { status: 502 });
    }

    if (!joonaRes.success) {
      await companyRef.update({ walletBalance: newBalance + ledger });
      return NextResponse.json({ error: "Erreur lors du décaissement. Votre solde a été recrédité." }, { status: 502 });
    }

    // ── IMPORTANT : la réponse de création est imbriquée dans `payout_group`
    // (contrairement à GET /payouts/{uuid} qui est plate). Voir CreatePayoutResult.
    const payoutGroup = joonaRes.data?.payout_group;
    const joonapayGroupUuid = payoutGroup?.uuid ?? null;

    await companyRef.collection("ledger").add({
      type: "debit",
      amount: ledger,
      balanceAfter: newBalance,
      reference: joonapayGroupUuid ?? "manual",
      label: `Retrait → ${recipientPhone}`,
      createdAt: Date.now(),
    });

    const payout: Payout = {
      id: poRef.id,
      companyId,
      joonapayPayoutId: joonapayGroupUuid,
      amount: ledger,
      currency: "XOF",
      ...planFields(plan),
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

    // Mémorisation du numéro et du réseau pour les prochains retraits (non bloquant)
    try {
      const toSave: StoredBeneficiary = {
        type: "mobile_money",
        name: recipientName?.trim() || "",
        phone: recipientPhone,
        operator: (recipientOperator?.trim() || paymentMethod.name) ?? null,
        bank: null,
        updatedAt: Date.now(),
      };
      await companyRef.collection("beneficiaries").doc(beneficiaryKey(toSave)).set(toSave, { merge: true });
    } catch (benErr) {
      console.error("beneficiary save (non bloquant):", benErr);
    }

    await sendPushAndStore({
      uid,
      companyId,
      title: "Décaissement en cours",
      body: `${plan.requestedAmount.toLocaleString("fr-FR")} ${plan.requestedCurrency} envoyés vers ${recipientPhone}`,
      type: "payout",
    });

    const userSnap = await db.collection("users").doc(uid).get();
    const userEmail = userSnap.data()?.email;
    if (userEmail) {
      await sendTransactionalEmail({
        to: [{ email: userEmail, name: userSnap.data()?.displayName }],
        subject: `Décaissement de ${plan.requestedAmount.toLocaleString("fr-FR")} ${plan.requestedCurrency} initié`,
        htmlContent: emailTemplate({
          title: "Décaissement initié",
          body: `Votre demande de décaissement de <strong>${plan.requestedAmount.toLocaleString("fr-FR")} ${plan.requestedCurrency}</strong> vers <strong>${recipientPhone}</strong> est en cours de traitement.`,
          ctaLabel: "Voir le tableau de bord",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payouts`,
        }),
      });
    }

    await notifyAdmin({
      title: `Demande de retrait — ${plan.requestedAmount.toLocaleString("fr-FR")} ${plan.requestedCurrency}`,
      body: `L'entreprise <strong>${company.name}</strong> a demandé un décaissement de <strong>${plan.requestedAmount.toLocaleString("fr-FR")} ${plan.requestedCurrency}</strong> vers ${recipientPhone}.`,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    });

    return NextResponse.json({ payoutId: poRef.id, joonapayId: joonapayGroupUuid });
  } catch (err) {
    if (err instanceof FxError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/joonapay/payouts:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}