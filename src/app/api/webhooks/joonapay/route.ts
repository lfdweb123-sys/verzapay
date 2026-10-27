import { assertSafeWebhookUrl } from "@/lib/safe-url";
import { alertLargePaymentSafe } from "@/lib/fraud-alert";
import { publicAmounts } from "@/lib/charge";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

const LOG_PREFIX = "[Joonapay Webhook]";

function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) {
    console.warn(`${LOG_PREFIX} Aucun header de signature reçu`);
    return false;
  }
  const received = signatureHeader.replace("sha256=", "");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    console.log(`${LOG_PREFIX} Comparaison signature -> valid=${valid}`);
    return valid;
  } catch (e) {
    console.error(`${LOG_PREFIX} Erreur comparaison signature (longueur différente probable):`, e);
    return false;
  }
}

async function notifyMerchantWebhook(
  companyId: string,
  payload: Record<string, unknown>,
  urlOverride?: string
) {
  const db = adminDb();
  try {
    let webhookUrl: string | null | undefined = urlOverride;

    if (!webhookUrl) {
      const companySnap = await db.collection("companies").doc(companyId).get();
      webhookUrl = companySnap.data()?.webhookUrl;
    }

    if (!webhookUrl) {
      console.log(`${LOG_PREFIX} [merchant-webhook] companyId=${companyId} -> pas d'URL configurée, rien à envoyer`);
      return;
    }

    console.log(`${LOG_PREFIX} [merchant-webhook] companyId=${companyId} -> POST ${webhookUrl}`);

    await assertSafeWebhookUrl(webhookUrl); // refuse localhost / réseaux privés (SSRF)
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });

    console.log(`${LOG_PREFIX} [merchant-webhook] companyId=${companyId} -> réponse status=${res.status}`);

    // ── Écriture du log ──────────────────────────────────────────────────
    try {
      await db.collection("companies").doc(companyId).collection("webhookLogs").add({
        type: payload.type ?? null,
        paymentId: payload.paymentId ?? payload.payoutId ?? null,
        amount: payload.amount ?? null,
        status: payload.status ?? null,
        sentAt: Date.now(),
        responseStatus: res.status,
        success: res.ok,
        payload,
      });
    } catch (logErr) {
      console.error(`${LOG_PREFIX} [merchant-webhook] Erreur écriture webhookLog:`, logErr);
    }

  } catch (err) {
    console.error(`${LOG_PREFIX} [merchant-webhook] companyId=${companyId} -> échec de livraison:`, err);

    // ── Log de l'échec réseau ────────────────────────────────────────────
    try {
      await db.collection("companies").doc(companyId).collection("webhookLogs").add({
        type: payload.type ?? null,
        paymentId: payload.paymentId ?? payload.payoutId ?? null,
        amount: payload.amount ?? null,
        status: payload.status ?? null,
        sentAt: Date.now(),
        responseStatus: null,
        success: false,
        payload,
      });
    } catch (logErr) {
      console.error(`${LOG_PREFIX} [merchant-webhook] Erreur écriture webhookLog (catch):`, logErr);
    }
  }
}

async function notifyMerchantWebhookSafe(
  companyId: string,
  payload: Record<string, unknown>,
  urlOverride?: string
) {
  try {
    await notifyMerchantWebhook(companyId, payload, urlOverride);
  } catch (err) {
    console.error(`${LOG_PREFIX} [merchant-webhook] companyId=${companyId} -> erreur inattendue:`, err);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  console.log(`${LOG_PREFIX} ===> Requête reçue à ${new Date(startedAt).toISOString()}`);

  try {
    const rawBody = await req.text();
    console.log(`${LOG_PREFIX} Taille du body brut: ${rawBody.length} caractères`);
    console.log(`${LOG_PREFIX} Body brut (extrait 1000 chars):`, rawBody.slice(0, 1000));

    const webhookSecret = process.env.JOONAPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(`${LOG_PREFIX} JOONAPAY_WEBHOOK_SECRET manquant dans les variables d'environnement`);
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const signature = req.headers.get("x-webhook-signature");
    console.log(`${LOG_PREFIX} Header x-webhook-signature présent:`, !!signature);

    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn(`${LOG_PREFIX} Signature invalide -> rejet 401`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    console.log(`${LOG_PREFIX} Signature valide ✅`);

    const event = JSON.parse(rawBody);
    const db = adminDb();

    const eventType: string = event?.event ?? "";
    const data = event?.data ?? {};
    const status: string = data?.status ?? "";

    console.log(`${LOG_PREFIX} eventType="${eventType}" status="${status}"`);
    console.log(`${LOG_PREFIX} data complet:`, JSON.stringify(data));

    const isPaid = status === "SUCCESS";
    const isFailed = status === "FAILED";

    // ── Paiements entrants ────────────────────────────────────────────────
    if (eventType === "payment.completed" || eventType === "payment.failed") {
      console.log(`${LOG_PREFIX} [payment] Branche paiement entrant`);

      const paymentRequestUuid: string | undefined = data?.payment_request_uuid;
      console.log(`${LOG_PREFIX} [payment] payment_request_uuid=${paymentRequestUuid}`);

      if (!paymentRequestUuid) {
        console.warn(`${LOG_PREFIX} [payment] Aucun payment_request_uuid dans le payload -> ack sans action`);
        return NextResponse.json({ ok: true });
      }

      const txQuery = await db.collectionGroup("transactions")
        .where("joonapayPaymentId", "==", paymentRequestUuid)
        .limit(1)
        .get();

      console.log(`${LOG_PREFIX} [payment] Transaction trouvée dans Firestore:`, !txQuery.empty);

      if (txQuery.empty) {
        console.warn(`${LOG_PREFIX} [payment] Aucune transaction Firestore correspondant à joonapayPaymentId=${paymentRequestUuid}`);
        return NextResponse.json({ ok: true });
      }

      const txDoc = txQuery.docs[0];
      const tx = txDoc.data();
      const companyId: string = tx.companyId;

      console.log(`${LOG_PREFIX} [payment] txDoc.id=${txDoc.id} companyId=${companyId} statutActuel=${tx.status} montant=${tx.amount} netAmount=${tx.netAmount}`);

      if (tx.status === "completed" || tx.status === "failed") {
        console.log(`${LOG_PREFIX} [payment] Déjà traité (status=${tx.status}) -> idempotence, ack sans action`);
        return NextResponse.json({ ok: true });
      }

      if (isPaid) {
        console.log(`${LOG_PREFIX} [payment] Paiement SUCCESS -> mise à jour transaction + crédit wallet`);

        await txDoc.ref.update({
          status: "completed",
          completedAt: Date.now(),
        });
        console.log(`${LOG_PREFIX} [payment] Transaction ${txDoc.id} marquée completed`);

        const netAmount: number = tx.netAmount ?? tx.amount;
        console.log(`${LOG_PREFIX} [payment] Crédit wallet companyId=${companyId} netAmount=${netAmount}`);

        await db.collection("companies").doc(companyId).update({
          walletBalance: FieldValue.increment(netAmount),
        });

        const updSnap = await db.collection("companies").doc(companyId).get();
        const newBalance = updSnap.data()?.walletBalance ?? 0;
        console.log(`${LOG_PREFIX} [payment] Nouveau solde companyId=${companyId} -> ${newBalance}`);

        await db.collection("companies").doc(companyId).collection("ledger").add({
          type: "credit",
          amount: netAmount,
          balanceAfter: newBalance,
          reference: paymentRequestUuid,
          label: `Paiement reçu — ${tx.customerName ?? tx.customerPhone ?? "client"}`,
          createdAt: Date.now(),
        });
        console.log(`${LOG_PREFIX} [payment] Entrée ledger créée pour reference=${paymentRequestUuid}`);

        // Anti-fraude : simple alerte à l'admin principal pour un gros paiement (ne bloque rien)
        await alertLargePaymentSafe({
          companyId,
          paymentId: txDoc.id,
          amount: tx.amount,
          currency: tx.currency,
          method: tx.method,
          customerName: tx.customerName,
          customerPhone: tx.customerPhone,
          customerEmail: tx.customerEmail,
          merchantReference: tx.merchantReference,
        });

        const companySnap = await db.collection("companies").doc(companyId).get();
        const ownerUid: string = companySnap.data()?.ownerUid;
        console.log(`${LOG_PREFIX} [payment] ownerUid=${ownerUid}`);

        if (ownerUid) {
          try {
            await sendPushAndStore({
              uid: ownerUid,
              companyId,
              title: "Paiement reçu 💰",
              body: `${tx.amount?.toLocaleString()} XOF reçus${tx.customerName ? " de " + tx.customerName : ""}.`,
              type: "payment",
              link: "/payments",
            });
            console.log(`${LOG_PREFIX} [payment] Push envoyée à uid=${ownerUid}`);
          } catch (pushErr) {
            console.error(`${LOG_PREFIX} [payment] Erreur envoi push:`, pushErr);
          }

          const userSnap = await db.collection("users").doc(ownerUid).get();
          const userEmail = userSnap.data()?.email;
          console.log(`${LOG_PREFIX} [payment] Email destinataire=${userEmail}`);

          if (userEmail) {
            try {
              await sendTransactionalEmail({
                to: [{ email: userEmail, name: userSnap.data()?.displayName }],
                subject: `Paiement de ${tx.amount?.toLocaleString()} XOF reçu`,
                htmlContent: emailTemplate({
                  title: "Paiement reçu",
                  body: `Un paiement de <strong>${tx.amount?.toLocaleString()} XOF</strong> a été reçu${tx.customerName ? " de " + tx.customerName : ""}. Votre solde net a été crédité de <strong>${netAmount.toLocaleString()} XOF</strong>.`,
                  ctaLabel: "Voir les paiements",
                  ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payments`,
                }),
              });
              console.log(`${LOG_PREFIX} [payment] Email envoyé à ${userEmail}`);
            } catch (emailErr) {
              console.error(`${LOG_PREFIX} [payment] Erreur envoi email:`, emailErr);
            }
          }
        }

        await notifyMerchantWebhookSafe(
          companyId,
          {
            type: "payment.completed",
            paymentId: txDoc.id,
            merchantReference: tx.merchantReference ?? null,
            customerEmail: tx.customerEmail ?? null,
            metadata: tx.metadata ?? null,
            ...publicAmounts(tx),
            chargedAmount: tx.chargeAmount ?? null,
            chargedCurrency: tx.chargeCurrency ?? null,
            status: "completed",
            customerName: tx.customerName ?? null,
            customerPhone: tx.customerPhone ?? null,
            companyId,
          },
          tx.webhookUrlOverride ?? undefined
        );
      } else if (isFailed) {
        console.log(`${LOG_PREFIX} [payment] Paiement FAILED -> marquage transaction failed`);
        await txDoc.ref.update({ status: "failed" });

        await notifyMerchantWebhookSafe(
          companyId,
          {
            type: "payment.failed",
            paymentId: txDoc.id,
            merchantReference: tx.merchantReference ?? null,
            customerEmail: tx.customerEmail ?? null,
            metadata: tx.metadata ?? null,
            ...publicAmounts(tx),
            chargedAmount: tx.chargeAmount ?? null,
            chargedCurrency: tx.chargeCurrency ?? null,
            status: "failed",
            customerName: tx.customerName ?? null,
            customerPhone: tx.customerPhone ?? null,
            companyId,
          },
          tx.webhookUrlOverride ?? undefined
        );
      } else {
        console.warn(`${LOG_PREFIX} [payment] status="${status}" non reconnu -> aucune action`);
      }

      console.log(`${LOG_PREFIX} [payment] Traitement terminé en ${Date.now() - startedAt}ms`);
      return NextResponse.json({ ok: true });
    }

    // ── Payouts (groupes) ─────────────────────────────────────────────────
    if (eventType === "payout_group.completed" || eventType === "payout_group.failed") {
      console.log(`${LOG_PREFIX} [payout] Branche payout group`);

      const payoutGroupUuid: string | undefined = data?.payout_group_uuid;
      console.log(`${LOG_PREFIX} [payout] payout_group_uuid=${payoutGroupUuid}`);

      if (!payoutGroupUuid) {
        console.warn(`${LOG_PREFIX} [payout] Aucun payout_group_uuid dans le payload -> ack sans action`);
        return NextResponse.json({ ok: true });
      }

      const groupStatus: string = status;
      const totalPayoutsCount: number = data?.total_payouts ?? 0;
      const successfulPayouts: number = data?.successful_payouts ?? 0;
      const failedPayoutsCount: number = data?.failed_payouts ?? 0;

      console.log(`${LOG_PREFIX} [payout] groupStatus=${groupStatus} total=${totalPayoutsCount} success=${successfulPayouts} failed=${failedPayoutsCount}`);

      const poQuery = await db.collectionGroup("payouts")
        .where("joonapayPayoutId", "==", payoutGroupUuid)
        .limit(1)
        .get();

      console.log(`${LOG_PREFIX} [payout] Payout trouvé dans Firestore:`, !poQuery.empty);

      if (!poQuery.empty) {
        const poDoc = poQuery.docs[0];
        const po = poDoc.data();
        const companyId: string = po.companyId;

        console.log(`${LOG_PREFIX} [payout] poDoc.id=${poDoc.id} companyId=${companyId} statutActuel=${po.status} amount=${po.amount}`);

        if (po.status === "completed" || po.status === "failed" || po.status === "partially_completed") {
          console.log(`${LOG_PREFIX} [payout] Déjà traité (status=${po.status}) -> idempotence, ack sans action`);
          return NextResponse.json({ ok: true });
        }

        const allFailed = failedPayoutsCount > 0 && failedPayoutsCount === totalPayoutsCount;
        const newStatus =
          groupStatus === "SUCCESS" ? "completed" :
          groupStatus === "PARTIAL" && allFailed ? "failed" :
          groupStatus === "PARTIAL" ? "partially_completed" :
          "processing";

        console.log(`${LOG_PREFIX} [payout] allFailed=${allFailed} -> newStatus="${newStatus}"`);

        await poDoc.ref.update({
          status: newStatus,
          processedAt: newStatus !== "processing" ? Date.now() : null,
          successfulPayouts,
          failedPayouts: failedPayoutsCount,
        });
        console.log(`${LOG_PREFIX} [payout] poDoc ${poDoc.id} mis à jour avec status=${newStatus}`);

        let refundAmount = 0;
        if (newStatus === "failed" || newStatus === "partially_completed") {
          const totalAmount: number = po.amount;

          refundAmount = newStatus === "failed"
            ? totalAmount
            : totalPayoutsCount > 0
              ? Math.round((failedPayoutsCount / totalPayoutsCount) * totalAmount)
              : totalAmount;

          console.log(`${LOG_PREFIX} [payout] Remboursement calculé: refundAmount=${refundAmount} (totalAmount=${totalAmount})`);

          if (refundAmount > 0) {
            const companyRef = db.collection("companies").doc(companyId);
            const newBalance = await db.runTransaction(async (t) => {
              const snap = await t.get(companyRef);
              const current = snap.data()?.walletBalance ?? 0;
              const updated = current + refundAmount;
              t.update(companyRef, { walletBalance: updated });
              return updated;
            });

            console.log(`${LOG_PREFIX} [payout] Wallet companyId=${companyId} recrédité -> newBalance=${newBalance}`);

            await companyRef.collection("ledger").add({
              type: "credit",
              amount: refundAmount,
              balanceAfter: newBalance,
              reference: payoutGroupUuid,
              label: newStatus === "failed"
                ? `Remboursement — décaissement échoué vers ${po.recipientPhone ?? "bénéficiaire"}`
                : `Remboursement partiel — ${failedPayoutsCount}/${totalPayoutsCount} transferts échoués vers ${po.recipientPhone ?? "bénéficiaire"}`,
              createdAt: Date.now(),
            });
            console.log(`${LOG_PREFIX} [payout] Entrée ledger de remboursement créée pour reference=${payoutGroupUuid}`);
          } else {
            console.log(`${LOG_PREFIX} [payout] refundAmount=0 -> pas de remboursement à effectuer`);
          }
        }

        await notifyMerchantWebhookSafe(companyId, {
          type: newStatus === "completed" ? "payout.completed" : "payout.failed",
          payoutId: poDoc.id,
          merchantReference: po.merchantReference ?? null,
          ...publicAmounts(po),
          status: newStatus,
          refundAmount: refundAmount || undefined,
          recipientPhone: po.recipientPhone ?? null,
          recipientName: po.recipientName ?? null,
          companyId,
        });
      } else {
        console.warn(`${LOG_PREFIX} [payout] Aucun document payout trouvé pour joonapayPayoutId=${payoutGroupUuid}`);
      }

      console.log(`${LOG_PREFIX} [payout] Traitement terminé en ${Date.now() - startedAt}ms`);
      return NextResponse.json({ ok: true });
    }

    console.warn(`${LOG_PREFIX} eventType="${eventType}" non géré -> ack sans action`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`${LOG_PREFIX} ❌ Erreur non gérée:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    console.log(`${LOG_PREFIX} <=== Fin de traitement (durée totale: ${Date.now() - startedAt}ms)`);
  }
}