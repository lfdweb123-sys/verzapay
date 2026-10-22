// app/api/cron/purge-pending-payments/route.ts
// Supprime les paiements restés "pending" depuis plus de 7 jours.
// À déclencher une fois par jour via cron-job.org :
//   GET https://<votre-domaine>/api/cron/purge-pending-payments
//   en-tête  x-cron-secret: <CRON_RECONCILE_SECRET>   (ou ?secret=...)
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const LOG_PREFIX = "[PurgePendingPayments]";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 400;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_RECONCILE_SECRET;
  if (!secret) {
    console.error(`${LOG_PREFIX} CRON_RECONCILE_SECRET manquant`);
    return false;
  }
  return req.headers.get("x-cron-secret") === secret || req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = adminDb();
    const cutoff = Date.now() - MAX_AGE_MS;
    let deleted = 0;

    // Boucle par lots pour rester sous la limite de 500 opérations par batch
    for (;;) {
      const snap = await db
        .collectionGroup("transactions")
        .where("status", "==", "pending")
        .where("createdAt", "<=", cutoff)
        .limit(BATCH_SIZE)
        .get();

      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;

      if (snap.size < BATCH_SIZE) break;
    }

    console.log(`${LOG_PREFIX} ${deleted} paiement(s) pending supprimé(s) (> 7 jours)`);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
