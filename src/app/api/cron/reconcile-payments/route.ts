// app/api/cron/reconcile-payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getJoonapayPayment } from "@/lib/joonapay";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { FieldValue } from "firebase-admin/firestore";

const LOG_PREFIX = "[ReconcilePayments]";

// Ne retraiter que les transactions "pending" depuis au moins ce délai,
// pour laisser le temps au webhook normal d'arriver avant de dupliquer le travail.
const MIN_AGE_MS = 3 * 60 * 1000; // 3 minutes

// Pour éviter de scanner indéfiniment les vieilles transactions bloquées
// (ex: liens de paiement jamais payés), on limite la fenêtre de recherche.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_RECONCILE_SECRET;
  if (!secret) {
    console.error(`${LOG_PREFIX} CRON_RECONCILE_SECRET manquant dans les variables d'environnement`);
    return false;
  }
  // cron-job.org permet d'ajouter soit un header custom, soit un query param.
  // On accepte les deux pour flexibilité.
  const headerSecret = req.headers.get("x-cron-secret");
  const querySecret = req.nextUrl.searchParams.get("secret");
  return headerSecret === secret || querySecret === secret;
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

    // collectionGroup pour scanner companies/*/transactions sans connaître companyId à l'avance
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
        console.warn(`${LOG_PREFIX} tx=${txDoc.id} n'a pas de joonapayPaymentId -> impossible de vérifier, skip`);
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

        const remoteStatus = paymentRes.data?.status; // "NEW" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED"
        console.log(`${LOG_PREFIX} tx=${txDoc.id} -> statut JoonaPay distant = "${remoteStatus}"`);

        // Re-vérification idempotence juste avant d'écrire (au cas où le webhook
        // serait arrivé entre le moment de la query et maintenant).
        const freshSnap = await txDoc.ref.get();
        const freshTx = freshSnap.data();
        if (freshTx?.status !== "pending") {
          console.log(`${LOG_PREFIX} tx=${txDoc.id} déjà mis à jour entre-temps (status=${freshTx?.status}) -> skip`);
          continue;
        }

        if (remoteStatus === "SUCCESS") {
          console.log(`${LOG_PREFIX} tx=${txDoc.id} -> SUCCESS confirmé, application du crédit (logique identique au webhook)`);

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
            label: `Paiement reçu (réconciliation manuelle) — ${tx.customerName ?? tx.customerPhone ?? "client"}`,
            createdAt: Date.now(),
          });

          console.log(`${LOG_PREFIX} tx=${txDoc.id} -> wallet companyId=${companyId} crédité de ${netAmount}, nouveau solde=${newBalance}`);

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