import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

const LOG_PREFIX = "[Joonapay Webhook]";

// Vérifie la signature HMAC envoyée par Joonapay (header X-Webhook-Signature)
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
    // Buffers de longueur différente -> signature invalide
    console.error(`${LOG_PREFIX} Erreur comparaison signature (longueur différente probable):`, e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  console.log(`${LOG_PREFIX} ===> Requête reçue à ${new Date(startedAt).toISOString()}`);

  try {
    // On lit le corps brut AVANT de le parser, car la signature HMAC
    // est calculée sur le texte brut exact envoyé par Joonapay.
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
    const status: string = data?.status ?? ""; // "SUCCESS" ou "FAILED"

    console.log(`${LOG_PREFIX} eventType="${eventType}" status="${status}"`);
    console.log(`${LOG_PREFIX} data complet:`, JSON.stringify(data));

    const isPaid = status === "SUCCESS";
    const isFailed = status === "FAILED";

    // --- Paiements entrants ---
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

      // Idempotence : si déjà traité, ne pas re-créditer
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

        // Créditer le solde marchand (montant net = montant - commission)
        const netAmount: number = tx.netAmount ?? tx.amount;
        console.log(`${LOG_PREFIX} [payment] Crédit wallet companyId=${companyId} netAmount=${netAmount}`);

        await db.collection("companies").doc(companyId).update({
          walletBalance: FieldValue.increment(netAmount),
        });

        // Entrée ledger
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

        // Notification push propriétaire de la compagnie
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

          // Email
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
      } else if (isFailed) {
        console.log(`${LOG_PREFIX} [payment] Paiement FAILED -> marquage transaction failed`);
        await txDoc.ref.update({ status: "failed" });
      } else {
        console.warn(`${LOG_PREFIX} [payment] status="${status}" non reconnu (ni SUCCESS ni FAILED) -> aucune action`);
      }

      console.log(`${LOG_PREFIX} [payment] Traitement terminé en ${Date.now() - startedAt}ms`);
      return NextResponse.json({ ok: true });
    }

    // --- Payouts (groupes) ---
    if (eventType === "payout_group.completed" || eventType === "payout_group.failed") {
      console.log(`${LOG_PREFIX} [payout] Branche payout group`);

      const payoutGroupUuid: string | undefined = data?.payout_group_uuid;
      console.log(`${LOG_PREFIX} [payout] payout_group_uuid=${payoutGroupUuid}`);

      if (!payoutGroupUuid) {
        console.warn(`${LOG_PREFIX} [payout] Aucun payout_group_uuid dans le payload -> ack sans action`);
        return NextResponse.json({ ok: true });
      }

      // IMPORTANT : le statut dans le PAYLOAD WEBHOOK suit un enum différent
      // de celui de GET /payouts/{uuid}. D'après le schéma WebhookPayoutGroupPayload :
      //   - "SUCCESS"  -> tous les payouts du groupe ont réussi
      //   - "PARTIAL"  -> au moins un payout a échoué (inclut le cas où TOUS échouent :
      //                   failed_payouts === total_payouts)
      // Il n'existe PAS de valeur "FAILED" dans le webhook lui-même — un échec total
      // se déduit en comparant failed_payouts à total_payouts.
      const groupStatus: string = status; // "SUCCESS" | "PARTIAL"
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

        console.log(`${LOG_PREFIX} [payout] poDoc.id=${poDoc.id} companyId=${po.companyId} statutActuel=${po.status} amount=${po.amount}`);

        // Idempotence : si déjà marqué dans un statut final, ne pas retraiter
        // (et surtout ne pas recréditer une deuxième fois).
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

        // Le solde a été débité de façon optimiste à la création du payout.
        // Si tout ou partie du groupe échoue, il faut recréditer le marchand
        // au prorata des transferts qui n'ont pas atteint leur bénéficiaire —
        // sinon cet argent disparaît sans jamais être ni envoyé, ni rendu.
        if (newStatus === "failed" || newStatus === "partially_completed") {
          const companyId: string = po.companyId;
          const totalAmount: number = po.amount;

          // Remboursement proportionnel à la part échouée du groupe.
          // Si total_payouts n'est pas disponible/cohérent, on rembourse tout
          // par sécurité plutôt que de risquer de ne pas rembourser assez.
          const refundAmount = newStatus === "failed"
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
      } else {
        console.warn(`${LOG_PREFIX} [payout] Aucun document payout trouvé pour joonapayPayoutId=${payoutGroupUuid}`);
      }

      console.log(`${LOG_PREFIX} [payout] Traitement terminé en ${Date.now() - startedAt}ms`);
      return NextResponse.json({ ok: true });
    }

    // Événement non géré — on accuse réception sans rien faire
    console.warn(`${LOG_PREFIX} eventType="${eventType}" non géré -> ack sans action`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`${LOG_PREFIX} ❌ Erreur non gérée:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    console.log(`${LOG_PREFIX} <=== Fin de traitement (durée totale: ${Date.now() - startedAt}ms)`);
  }
}