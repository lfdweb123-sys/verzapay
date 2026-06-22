import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();
    const db = adminDb();

    // Joonapay envoie un event avec un payment_id
    const joonapayPaymentId = event?.data?.id ?? event?.payment_id ?? event?.id;
    const eventType: string = event?.event ?? event?.type ?? "";
    const status: string = event?.data?.status ?? event?.status ?? "";

    if (!joonapayPaymentId) return NextResponse.json({ ok: true });

    // Retrouver la transaction par joonapayPaymentId (via collectionGroup)
    const txQuery = await db.collectionGroup("transactions")
      .where("joonapayPaymentId", "==", joonapayPaymentId)
      .limit(1)
      .get();

    if (txQuery.empty) return NextResponse.json({ ok: true });

    const txDoc = txQuery.docs[0];
    const tx = txDoc.data();
    const companyId: string = tx.companyId;

    const isPaid = status === "completed" || status === "paid" || eventType.includes("paid") || eventType.includes("success");
    const isFailed = status === "failed" || status === "cancelled" || status === "expired";

    if (isPaid) {
      // Mettre à jour la transaction
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
        reference: joonapayPaymentId,
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

    // Gérer les payouts
    if (eventType.includes("payout") || event?.data?.type === "payout") {
      const joonapayPayoutId = joonapayPaymentId;
      const poQuery = await db.collectionGroup("payouts")
        .where("joonapayPayoutId", "==", joonapayPayoutId)
        .limit(1)
        .get();

      if (!poQuery.empty) {
        const poDoc = poQuery.docs[0];
        const newStatus = isPaid ? "completed" : isFailed ? "failed" : "processing";
        await poDoc.ref.update({ status: newStatus, processedAt: isPaid ? Date.now() : null });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook Joonapay error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
