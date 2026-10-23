import { adminDb, adminAuth } from "@/lib/firebase-admin";

export type DeleteResult = { deleted: true } | { deleted: false; reason: string };

/**
 * Un compte n'est JAMAIS supprimé automatiquement s'il est administrateur ou
 * s'il possède une entreprise avec de l'argent (solde > 0) ou un KYC approuvé.
 */
async function deletionBlocker(uid: string, userData: FirebaseFirestore.DocumentData): Promise<string | null> {
  if (userData.isAdmin) return "compte administrateur";
  const db = adminDb();
  const owned = await db.collection("companies").where("ownerUid", "==", uid).get();
  for (const c of owned.docs) {
    const d = c.data();
    if (Number(d.walletBalance ?? 0) > 0) return "solde de portefeuille positif";
    if (d.kycStatus === "approved") return "KYC approuvé";
  }
  return null;
}

/**
 * Suppression définitive : compte Firebase Auth, document utilisateur, codes
 * de vérification et entreprises dont il est propriétaire (sous-collections
 * comprises). Refusée (sans rien supprimer) si un garde-fou s'applique.
 */
export async function hardDeleteUser(uid: string): Promise<DeleteResult> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  const data = snap.data() ?? {};

  if (snap.exists) {
    const blocker = await deletionBlocker(uid, data);
    if (blocker) return { deleted: false, reason: blocker };
  }

  const owned = await db.collection("companies").where("ownerUid", "==", uid).get();
  for (const c of owned.docs) {
    await db.recursiveDelete(c.ref);
  }

  try {
    await (await adminAuth()).deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }

  await db.collection("twoFactorCodes").doc(uid).delete().catch(() => undefined);
  if (snap.exists) await userRef.delete();

  return { deleted: true };
}

/** Désactive / réactive un compte et suspend / réactive ses entreprises (sans envoyer d'email). */
export async function setUserDisabled(uid: string, disabled: boolean, reason?: string | null): Promise<void> {
  const db = adminDb();
  await (await adminAuth()).updateUser(uid, { disabled });

  await db.collection("users").doc(uid).update(
    disabled
      ? { disabled: true, disabledAt: Date.now(), disabledReason: reason ?? null }
      : { disabled: false, disabledAt: null, disabledReason: null }
  );

  const companies = await db.collection("companies").where("ownerUid", "==", uid).get();
  if (companies.empty) return;
  const batch = db.batch();
  companies.docs.forEach((c) =>
    batch.update(
      c.ref,
      disabled
        ? { suspended: true, suspendedReason: reason ?? "Compte marchand désactivé par l'administration" }
        : { suspended: false, suspendedReason: null }
    )
  );
  await batch.commit();
}
