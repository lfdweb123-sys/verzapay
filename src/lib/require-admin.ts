import { adminDb } from "@/lib/firebase-admin";

/**
 * Vérifie que l'uid fourni correspond bien à un compte admin (isAdmin: true
 * dans Firestore). À appeler systématiquement en tout début de chaque route
 * API admin, avant tout accès aux données.
 */
export async function requireAdmin(uid: string | null | undefined): Promise<boolean> {
  if (!uid) return false;
  const db = adminDb();
  const snap = await db.collection("users").doc(uid).get();
  return snap.data()?.isAdmin === true;
}
