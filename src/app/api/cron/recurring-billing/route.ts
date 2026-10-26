// app/api/cron/recurring-billing/route.ts
// Facturation récurrente : crée le lien de paiement de chaque abonnement arrivé à échéance
// (via la route de paiement EXISTANTE, qui envoie l'email au client) puis planifie l'échéance suivante.
// À déclencher une fois par jour via cron-job.org :
//   GET https://<domaine>/api/cron/recurring-billing   en-tête  x-cron-secret: <CRON_RECONCILE_SECRET>
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { nextFutureRun, type Interval } from "@/lib/subscriptions";
import { sendPushAndStore } from "@/lib/push";

const LOG = "[RecurringBilling]";
const MAX_PER_RUN = 50;
const MAX_FAILURES = 3;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_RECONCILE_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret || req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const internal = process.env.INTERNAL_API_SECRET || process.env.CRON_RECONCILE_SECRET!;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const db = adminDb();
  const now = Date.now();
  const stats = { due: 0, created: 0, failed: 0, paused: 0 };

  try {
    const snap = await db.collection("subscriptions").where("status", "==", "active").limit(500).get();
    const due = snap.docs.filter((d) => Number(d.data().nextRunAt) <= now).slice(0, MAX_PER_RUN);
    stats.due = due.length;

    for (const doc of due) {
      const s = doc.data();
      try {
        const res = await fetch(`${origin}/api/payments-engine/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-vpz-internal": internal, "x-vpz-internal-uid": s.createdBy },
          body: JSON.stringify({
            uid: s.createdBy, companyId: s.companyId, amount: s.amount, currency: s.currency,
            description: s.description || `Abonnement — ${s.customerName}`,
            customerName: s.customerName, customerPhone: s.customerPhone, customerEmail: s.customerEmail, channel: "ANY",
          }),
          signal: AbortSignal.timeout(45_000),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);

        await doc.ref.update({
          runs: Number(s.runs ?? 0) + 1, failures: 0, lastError: null, lastRunAt: now, lastTxId: out.paymentId ?? null,
          nextRunAt: nextFutureRun(Number(s.nextRunAt), s.interval as Interval, now),
        });
        stats.created++;
      } catch (err) {
        const failures = Number(s.failures ?? 0) + 1;
        const pause = failures >= MAX_FAILURES;
        await doc.ref.update({ failures, lastError: (err as Error).message.slice(0, 200), ...(pause ? { status: "paused" } : {}) });
        stats.failed++;
        if (pause) {
          stats.paused++;
          await sendPushAndStore({ uid: s.createdBy, companyId: s.companyId, title: "Abonnement suspendu", body: `La facturation de ${s.customerName} a échoué ${MAX_FAILURES} fois : l'abonnement est en pause.`, type: "system" }).catch(() => undefined);
        }
        console.error(`${LOG} échec ${doc.id}:`, (err as Error).message);
      }
    }
    console.log(LOG, stats);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    console.error(`${LOG} erreur:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
