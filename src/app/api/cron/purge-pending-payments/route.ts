
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import {
  FieldPath,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOG_PREFIX = "[PurgePendingPayments]";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 400;

// Marqueur persistant : indique que le nettoyage initial est terminé.
const INITIAL_CLEANUP_REF = "system/cron-purge-pending-payments";

function isAuthorized(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_RECONCILE_SECRET;

  if (!expectedSecret) {
    console.error(`${LOG_PREFIX} CRON_RECONCILE_SECRET manquant`);
    return false;
  }

  const headerSecret = req.headers.get("x-cron-secret");
  const querySecret = req.nextUrl.searchParams.get("secret");

  return (
    headerSecret === expectedSecret ||
    querySecret === expectedSecret
  );
}

/**
 * Convertit une date connue en millisecondes.
 * Prend en charge les Timestamp Firestore et les nombres en
 * millisecondes ou secondes Unix.
 */
function getCreatedAtMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const result = value.toMillis();
    return Number.isFinite(result) ? result : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Les timestamps Unix actuels en secondes ont 10 chiffres.
    return value < 100_000_000_000 ? value * 1000 : value;
  }

  return null;
}

/**
 * Détermine si le nettoyage initial a déjà été effectué.
 */
async function hasInitialCleanupCompleted(
  db: FirebaseFirestore.Firestore
): Promise<boolean> {
  const snapshot = await db.doc(INITIAL_CLEANUP_REF).get();
  return snapshot.data()?.completed === true;
}

/**
 * Nettoyage initial : supprime tous les paiements pending.
 *
 * Le marqueur n'est créé qu'après la fin de toutes les suppressions.
 * En cas d'erreur, une prochaine exécution pourra reprendre le travail.
 */
async function runInitialCleanup(
  db: FirebaseFirestore.Firestore
): Promise<number> {
  let deleted = 0;

  console.log(`${LOG_PREFIX} Début du nettoyage initial`);

  for (;;) {
    // Requête paginée : les documents supprimés ne seront plus
    // présents lors des recherches suivantes.
    const snapshot = await db
      .collectionGroup("transactions")
      .where("status", "==", "pending")
      .orderBy(FieldPath.documentId())
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();

    for (const document of snapshot.docs) {
      batch.delete(document.ref);
    }

    await batch.commit();
    deleted += snapshot.size;

    console.log(
      `${LOG_PREFIX} Nettoyage initial : ${deleted} document(s) supprimé(s)`
    );

    if (snapshot.size < BATCH_SIZE) {
      break;
    }
  }

  // Le marqueur est enregistré uniquement après le nettoyage.
  await db.doc(INITIAL_CLEANUP_REF).set({
    completed: true,
    completedAt: FieldValue.serverTimestamp(),
    initialDeleted: deleted,
  });

  console.log(
    `${LOG_PREFIX} Nettoyage initial terminé : ${deleted} suppression(s)`
  );

  return deleted;
}

/**
 * Nettoyage quotidien : supprime les paiements pending de plus
 * de 7 jours. Le format du champ createdAt doit correspondre
 * à celui utilisé dans la base.
 */
async function runDailyCleanup(
  db: FirebaseFirestore.Firestore
): Promise<number> {
  const cutoffMillis = Date.now() - MAX_AGE_MS;

  // Cette requête correspond aux documents où createdAt est un
  // nombre en millisecondes Unix.
  const snapshot = await db
    .collectionGroup("transactions")
    .where("status", "==", "pending")
    .where("createdAt", "<=", cutoffMillis)
    .limit(BATCH_SIZE)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();
  let deleted = 0;

  for (const document of snapshot.docs) {
    const createdAt = getCreatedAtMillis(document.get("createdAt"));

    // Vérification supplémentaire avant suppression.
    if (
      createdAt !== null &&
      createdAt <= cutoffMillis &&
      document.get("status") === "pending"
    ) {
      batch.delete(document.ref);
      deleted++;
    }
  }

  if (deleted > 0) {
    await batch.commit();
  }

  return deleted;
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

    // Vérifier si le nettoyage initial est déjà terminé.
    const initialCompleted = await hasInitialCleanupCompleted(db);

    if (!initialCompleted) {
      const deleted = await runInitialCleanup(db);

      return NextResponse.json({
        ok: true,
        mode: "initial",
        deleted,
        message:
          "Nettoyage initial terminé. Les prochaines exécutions appliqueront la règle des 7 jours.",
      });
    }

    // Exécutions suivantes : nettoyage des paiements anciens.
    let totalDeleted = 0;

    for (;;) {
      const deleted = await runDailyCleanup(db);

      totalDeleted += deleted;

      // S'il n'y a rien à supprimer, le nettoyage est terminé.
      if (deleted === 0) {
        break;
      }

      // Protection contre une boucle inutile si le lot est incomplet.
      if (deleted < BATCH_SIZE) {
        break;
      }
    }

    console.log(
      `${LOG_PREFIX} Nettoyage quotidien terminé : ${totalDeleted} suppression(s)`
    );

    return NextResponse.json({
      ok: true,
      mode: "daily",
      deleted: totalDeleted,
      message:
        "Nettoyage quotidien terminé. Les paiements pending de 7 jours ou plus ont été supprimés.",
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
