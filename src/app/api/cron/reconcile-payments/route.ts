// app/api/cron/reconcile-payments/route.ts
import { assertSafeWebhookUrl } from "@/lib/safe-url";
import { alertLargePaymentSafe } from "@/lib/fraud-alert";
import { publicAmounts } from "@/lib/charge";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getJoonapayPayment } from "@/lib/joonapay";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { FieldValue } from "firebase-admin/firestore";

const LOG_PREFIX = "[ReconcilePayments]";

const MIN_AGE_MS = 3 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_RECONCILE_SECRET;
  if (!secret) {
    console.error(`${LOG_PREFIX} CRON_RECONCILE_SECRET manquant dans les variables d'environnement`);
    return false;
  }
  const headerSecret = req.headers.get("x-cron-secret");
  const querySecret = req.nextUrl.searchParams.get("secret");
  return headerSecret === secret || querySecret === secret;
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
      console.log(`${LOG_PREFIX} [merchant-webhook] companyId=${companyId} -> pas d'URL configurée`);
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

    // ── Log ──────────────────────────────────────────────────────────────
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
    console.error(`${LOG_PREFIX} [merchant-webhook] companyId=${companyId} -> échec livraison:`, err);

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

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  console.log(`${LOG_PREFIX} ===> Réconciliation déclenchée à ${new Date(startedAt).toISOString()}`);

  if (!isAuthorized(req)) {
    console.warn(`${LOG_PREFIX} Accès non autorisé — secret invalide ou manquant`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = adminDb();
    const now = Date.now();
    const cutoffRecent = now - MIN_AGE_MS;
    const cutoffOld = now - MAX_AGE_MS;

    console.log(`${LOG_PREFIX} Recherche des transactions pending entre ${new Date(cutoffOld).toISOString()} et ${new Date(cutoffRecent).toISOString()}`);

    const pendingSnap = await db
      .collectionGroup("transactions")
      .where("status", "==", "pending")
      .where("createdAt", ">=", cutoffOld)
      .where("createdAt", "<=", cutoffRecent)
      .get();

    console.log(`${LOG_PREFIX} ${pendingSnap.size} transaction(s) pending trouvée(s) à vérifier`);

    const results = {
      checked: 0,
      updatedToCompleted: 0,
      updatedToFailed: 0,
      stillPending: 0,
      skippedNoJoonapayId: 0,
      errors: 0,
    };

    for (const txDoc of pendingSnap.docs) {
      const tx = txDoc.data();
      const companyId: string = tx.companyId;
      const joonapayPaymentId: string | null = tx.joonapayPaymentId ?? null;

      console.log(`${LOG_PREFIX} --- Vérification tx=${txDoc.id} companyId=${companyId} joonapayPaymentId=${joonapayPaymentId}`);

      if (!joonapayPaymentId) {
        console.warn(`${LOG_PREFIX} tx=${txDoc.id} n'a pas de joonapayPaymentId -> skip`);
        results.skippedNoJoonapayId++;
        continue;
      }

      try {
        const paymentRes = await getJoonapayPayment(joonapayPaymentId);
        results.checked++;

        if (!paymentRes.success) {
          console.error(`${LOG_PREFIX} tx=${txDoc.id} -> JoonaPay a renvoyé success=false`, paymentRes);
          results.errors++;
          continue;
        }

        const remoteStatus = paymentRes.data?.status;
        console.log(`${LOG_PREFIX} tx=${txDoc.id} -> statut JoonaPay distant = "${remoteStatus}"`);

        // Idempotence — re-lecture juste avant l'écriture
        const freshSnap = await txDoc.ref.get();
        const freshTx = freshSnap.data();
        if (freshTx?.status !== "pending") {
          console.log(`${LOG_PREFIX} tx=${txDoc.id} déjà mis à jour entre-temps (status=${freshTx?.status}) -> skip`);
          continue;
        }

        if (remoteStatus === "SUCCESS") {
          console.log(`${LOG_PREFIX} tx=${txDoc.id} -> SUCCESS confirmé, application du crédit`);

          await txDoc.ref.update({
            status: "completed",
            completedAt: Date.now(),
            reconciledManually: true,
          });

          const netAmount: number = tx.netAmount ?? tx.amount;
          await db.collection("companies").doc(companyId).update({
            walletBalance: FieldValue.increment(netAmount),
          });

          const updSnap = await db.collection("companies").doc(companyId).get();
          const newBalance = updSnap.data()?.walletBalance ?? 0;

          await db.collection("companies").doc(companyId).collection("ledger").add({
            type: "credit",
            amount: netAmount,
            balanceAfter: newBalance,
            reference: joonapayPaymentId,
            label: `Paiement reçu (réconciliation) — ${tx.customerName ?? tx.customerPhone ?? "client"}`,
            createdAt: Date.now(),
          });

          console.log(`${LOG_PREFIX} tx=${txDoc.id} -> wallet companyId=${companyId} crédité de ${netAmount}, nouveau solde=${newBalance}`);

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

          // Notification marchand webhook
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
              reconciledManually: true,
            },
            tx.webhookUrlOverride ?? undefined
          );

          const companySnap = await db.collection("companies").doc(companyId).get();
          const ownerUid: string = companySnap.data()?.ownerUid;

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
              console.log(`${LOG_PREFIX} tx=${txDoc.id} -> push envoyée à uid=${ownerUid}`);
            } catch (pushErr) {
              console.error(`${LOG_PREFIX} tx=${txDoc.id} -> erreur push (non bloquant):`, pushErr);
            }

            const userSnap = await db.collection("users").doc(ownerUid).get();
            const userEmail = userSnap.data()?.email;
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
                console.log(`${LOG_PREFIX} tx=${txDoc.id} -> email envoyé à ${userEmail}`);
              } catch (emailErr) {
                console.error(`${LOG_PREFIX} tx=${txDoc.id} -> erreur email (non bloquant):`, emailErr);
              }
            }
          }

          results.updatedToCompleted++;

        } else if (remoteStatus === "FAILED" || remoteStatus === "CANCELLED" || remoteStatus === "EXPIRED") {
          console.log(`${LOG_PREFIX} tx=${txDoc.id} -> statut distant "${remoteStatus}" -> marquage failed`);

          await txDoc.ref.update({
            status: "failed",
            reconciledManually: true,
          });

          // Notification marchand webhook
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
              reconciledManually: true,
            },
            tx.webhookUrlOverride ?? undefined
          );

          results.updatedToFailed++;

        } else {
          console.log(`${LOG_PREFIX} tx=${txDoc.id} -> toujours en attente côté JoonaPay (status="${remoteStatus}") -> rien à faire`);
          results.stillPending++;
        }
      } catch (txErr) {
        console.error(`${LOG_PREFIX} tx=${txDoc.id} -> erreur lors de la vérification:`, txErr);
        results.errors++;
      }
    }

    console.log(`${LOG_PREFIX} ✅ Réconciliation terminée en ${Date.now() - startedAt}ms`, results);

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...results,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} ❌ Erreur globale de réconciliation:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}