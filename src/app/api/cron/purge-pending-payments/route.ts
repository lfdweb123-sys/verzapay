
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOG_PREFIX = "[PurgePendingPayments]";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 400;
const LOCK_DURATION_MS = 10 * 60 * 1000;

const INITIAL_CLEANUP_PATH = "system/cron-purge-pending-payments";
const TARGET_STATUSES = new Set(["pending", "failed"]);

function isAuthorized(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_RECONCILE_SECRET;

  if (!expectedSecret) {
    console.error(`${LOG_PREFIX} CRON_RECONCILE_SECRET manquant`);
    return false;
  }

  return (
    req.headers.get("x-cron-secret") === expectedSecret ||
    req.nextUrl.searchParams.get("secret") === expectedSecret
  );
}

/**
 * Convertit les formats de date connus en millisecondes Unix.
 * Une date inconnue est ignorée par le nettoyage quotidien.
 */
function getCreatedAtMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    const result = value.getTime();
    return Number.isFinite(result) ? result : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Accepte les timestamps en secondes ou millisecondes.
    return value < 100_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }

  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;

    if (typeof toMillis === "function") {
      try {
        const result = toMillis.call(value);
        return typeof result === "number" && Number.isFinite(result)
          ? result
          : null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Parcourt toute la collection group sans filtrer sur status
 * ni createdAt dans Firestore : cela évite l'index de statut
 * signalé dans l'erreur FAILED_PRECONDITION.
 *
 * Les documents non concernés sont conservés.
 */
async function purgeTransactions(
  db: FirebaseFirestore.Firestore,
  initial: boolean
): Promise<number> {
  let deleted = 0;
  let lastDocument:
    | FirebaseFirestore.QueryDocumentSnapshot
    | undefined;

  const cutoff = Date.now() - MAX_AGE_MS;

  for (;;) {
    let query = db
      .collectionGroup("transactions")
      .limit(BATCH_SIZE);

    if (lastDocument) {
      query = query.startAfter(lastDocument);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    let batchDeleteCount = 0;

    for (const doc of snapshot.docs) {
      const status = doc.get("status");

      // Ne supprime que ces deux statuts exacts.
      if (typeof status !== "string" || !TARGET_STATUSES.has(status)) {
        continue;
      }

      if (!initial) {
        const createdAt = getCreatedAtMillis(doc.get("createdAt"));

        // Sans date exploitable, ne pas supprimer en mode quotidien.
        if (createdAt === null || createdAt > cutoff) {
          continue;
        }
      }

      batch.delete(doc.ref);
      batchDeleteCount++;
    }

    // Le curseur est avancé à la fin du lot lu, même si
    // aucun document de ce lot ne doit être supprimé.
    lastDocument = snapshot.docs[snapshot.docs.length - 1];

    if (batchDeleteCount > 0) {
      await batch.commit();
      deleted += batchDeleteCount;

      console.log(
        `${LOG_PREFIX} Mode=${initial ? "initial" : "daily"} : ` +
          `${batchDeleteCount} suppression(s), total=${deleted}`
      );
    }

    if (snapshot.size < BATCH_SIZE) {
      break;
    }
  }

  return deleted;
}

/**
 * Supprime les notifications déjà lues (champ read === true).
 * Filtre sur un seul champ : aucun index composite nécessaire.
 */
async function purgeReadNotifications(
  db: FirebaseFirestore.Firestore
): Promise<number> {
  let deleted = 0;

  for (;;) {
    const snapshot = await db
      .collection("notifications")
      .where("read", "==", true)
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < BATCH_SIZE) break;
  }

  console.log(`${LOG_PREFIX} ${deleted} notification(s) lue(s) supprimée(s)`);
  return deleted;
}

type InitialState =
  | { mode: "initial"; acquired: true }
  | { mode: "daily"; acquired: false }
  | { mode: "busy"; acquired: false };

/**
 * Réserve le nettoyage initial dans une transaction Firestore.
 * Un verrou expirant permet de reprendre après une interruption.
 */
async function acquireInitialCleanup(
  db: FirebaseFirestore.Firestore
): Promise<InitialState> {
  const ref = db.doc(INITIAL_CLEANUP_PATH);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();

    if (data?.completed === true) {
      return { mode: "daily", acquired: false };
    }

    const now = Date.now();
    const leaseUntil =
      typeof data?.leaseUntil === "number" ? data.leaseUntil : 0;

    if (data?.running === true && leaseUntil > now) {
      return { mode: "busy", acquired: false };
    }

    transaction.set(
      ref,
      {
        running: true,
        completed: false,
        leaseUntil: now + LOCK_DURATION_MS,
        startedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return { mode: "initial", acquired: true };
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const db = adminDb();
    const state = await acquireInitialCleanup(db);
    const markerRef = db.doc(INITIAL_CLEANUP_PATH);

    if (state.mode === "busy") {
      return NextResponse.json(
        {
          ok: false,
          mode: "initial",
          deleted: 0,
          error:
            "Le nettoyage initial est déjà en cours. Réessaie plus tard.",
        },
        { status: 409 }
      );
    }

    if (state.mode === "initial" && state.acquired) {
      console.log(`${LOG_PREFIX} Début du nettoyage initial`);

      try {
        const deleted = await purgeTransactions(db, true);
        const deletedNotifications = await purgeReadNotifications(db);

        await markerRef.set(
          {
            running: false,
            completed: true,
            leaseUntil: 0,
            completedAt: Timestamp.now(),
            initialDeleted: deleted,
          },
          { merge: true }
        );

        console.log(
          `${LOG_PREFIX} Nettoyage initial terminé : ${deleted} suppression(s)`
        );

        return NextResponse.json({
          ok: true,
          mode: "initial",
          deleted,
          deletedNotifications,
          message:
            "Tous les paiements pending et failed ont été traités. Les prochaines exécutions appliqueront la règle des 7 jours.",
        });
      } catch (error) {
        // Le nettoyage initial n'est PAS marqué comme terminé.
        // Le verrou expirera et une exécution ultérieure reprendra.
        console.error(`${LOG_PREFIX} Erreur initiale :`, error);

        return NextResponse.json(
          {
            ok: false,
            mode: "initial",
            error:
              error instanceof Error
                ? error.message
                : "Échec du nettoyage initial.",
          },
          { status: 500 }
        );
      }
    }

    console.log(`${LOG_PREFIX} Début du nettoyage quotidien`);

    const deleted = await purgeTransactions(db, false);
    const deletedNotifications = await purgeReadNotifications(db);

    // Historique de la page Status : conservé 3 jours
    const oldChecks = await db
      .collection("statusChecks")
      .where("at", "<", Date.now() - 3 * 24 * 60 * 60 * 1000)
      .limit(400)
      .get();
    if (!oldChecks.empty) {
      const statusBatch = db.batch();
      oldChecks.docs.forEach((d) => statusBatch.delete(d.ref));
      await statusBatch.commit();
    }

    console.log(
      `${LOG_PREFIX} Nettoyage quotidien terminé : ${deleted} suppression(s)`
    );

    return NextResponse.json({
      ok: true,
      mode: "daily",
      deleted,
      deletedNotifications,
      message:
        "Les paiements pending et failed âgés d'au moins 7 jours ont été traités.",
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Erreur :`, error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant le nettoyage.",
      },
      { status: 500 }
    );
  }
}
