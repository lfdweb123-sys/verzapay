import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";

/**
 * Vérifie que l'appelant est bien le compte `uid` (jeton Firebase signé, pas
 * seulement un uid déclaré) ET que ce compte est administrateur (isAdmin: true
 * dans Firestore). À appeler systématiquement en tout début de chaque route
 * API admin, avant tout accès aux données.
 */
export async function requireAdmin(uid: string | null | undefined): Promise<boolean> {
  if (!uid) return false;
  if (!(await verifyRequestUid(uid))) return false;
  const db = adminDb();
  const snap = await db.collection("users").doc(uid).get();
  return snap.data()?.isAdmin === true;
}
