import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

// Vérifie la signature HMAC envoyée par Joonapay (header X-Webhook-Signature)
function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const received = signatureHeader.replace("sha256=", "");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    // Buffers de longueur différente -> signature invalide
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // On lit le corps brut AVANT de le parser, car la signature HMAC
    // est calculée sur le texte brut exact envoyé par Joonapay.
    const rawBody = await req.text();

    const webhookSecret = process.env.JOONAPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("JOONAPAY_WEBHOOK_SECRET manquant dans les variables d'environnement");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const signature = req.headers.get("x-webhook-signature");
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn("Webhook Joonapay : signature invalide");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const db = adminDb();

    const eventType: string = event?.event ?? "";
    const data = event?.data ?? {};
    const status: string = data?.status ?? ""; // "SUCCESS" ou "FAILED"

    const isPaid = status === "SUCCESS";
    const isFailed = status === "FAILED";

    // --- Paiements entrants ---
    if (eventType === "payment.completed" || eventType === "payment.failed") {
      const paymentRequestUuid: string | undefined = data?.payment_request_uuid;
      if (!paymentRequestUuid) return NextResponse.json({ ok: true });

      const txQuery = await db.collectionGroup("transactions")
        .where("joonapayPaymentId", "==", paymentRequestUuid)
        .limit(1)
        .get();

      if (txQuery.empty) return NextResponse.json({ ok: true });

      const txDoc = txQuery.docs[0];
      const tx = txDoc.data();
      const companyId: string = tx.companyId;

      // Idempotence : si déjà traité, ne pas re-créditer
      if (tx.status === "completed" || tx.status === "failed") {
        return NextResponse.json({ ok: true });
      }

      if (isPaid) {
        await txDoc.ref.update({
          status: "completed",
          completedAt: Date.now(),
        });

        // Créditer le solde marchand (montant net = montant - commission)
        const netAmount: number = tx.netAmount ?? tx.amount;
        await db.collection("companies").doc(companyId).update({
          walletBalance: FieldValue.increment(netAmount),
        });

        // Entrée ledger
        const updSnap = await db.collection("companies").doc(companyId).get();
        const newBalance = updSnap.data()?.walletBalance ?? 0;
        await db.collection("companies").doc(companyId).collection("ledger").add({
          type: "credit",
          amount: netAmount,
          balanceAfter: newBalance,
          reference: paymentRequestUuid,
          label: `Paiement reçu — ${tx.customerName ?? tx.customerPhone ?? "client"}`,
          createdAt: Date.now(),
        });

        // Notification push propriétaire de la compagnie
        const companySnap = await db.collection("companies").doc(companyId).get();
        const ownerUid: string = companySnap.data()?.ownerUid;
        if (ownerUid) {
          await sendPushAndStore({
            uid: ownerUid,
            companyId,
            title: "Paiement reçu 💰",
            body: `${tx.amount?.toLocaleString()} XOF reçus${tx.customerName ? " de " + tx.customerName : ""}.`,
            type: "payment",
            link: "/payments",
          });

          // Email
          const userSnap = await db.collection("users").doc(ownerUid).get();
          const userEmail = userSnap.data()?.email;
          if (userEmail) {
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
          }
        }
      } else if (isFailed) {
        await txDoc.ref.update({ status: "failed" });
      }

      return NextResponse.json({ ok: true });
    }

    // --- Payouts (groupes) ---
    if (eventType === "payout_group.completed" || eventType === "payout_group.failed") {
      const payoutGroupUuid: string | undefined = data?.payout_group_uuid;
      if (!payoutGroupUuid) return NextResponse.json({ ok: true });

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

      const poQuery = await db.collectionGroup("payouts")
        .where("joonapayPayoutId", "==", payoutGroupUuid)
        .limit(1)
        .get();

      if (!poQuery.empty) {
        const poDoc = poQuery.docs[0];
        const po = poDoc.data();

        // Idempotence : si déjà marqué dans un statut final, ne pas retraiter
        // (et surtout ne pas recréditer une deuxième fois).
        if (po.status === "completed" || po.status === "failed" || po.status === "partially_completed") {
          return NextResponse.json({ ok: true });
        }

        const allFailed = failedPayoutsCount > 0 && failedPayoutsCount === totalPayoutsCount;
        const newStatus =
          groupStatus === "SUCCESS" ? "completed" :
          groupStatus === "PARTIAL" && allFailed ? "failed" :
          groupStatus === "PARTIAL" ? "partially_completed" :
          "processing";

        await poDoc.ref.update({
          status: newStatus,
          processedAt: newStatus !== "processing" ? Date.now() : null,
          successfulPayouts,
          failedPayouts: failedPayoutsCount,
        });

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

          if (refundAmount > 0) {
            const companyRef = db.collection("companies").doc(companyId);
            const newBalance = await db.runTransaction(async (t) => {
              const snap = await t.get(companyRef);
              const current = snap.data()?.walletBalance ?? 0;
              const updated = current + refundAmount;
              t.update(companyRef, { walletBalance: updated });
              return updated;
            });

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
          }
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Événement non géré — on accuse réception sans rien faire
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook Joonapay error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}