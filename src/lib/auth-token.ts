import { headers } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

/**
 * Vérifie que la requête provient bien de l'utilisateur `uid` : le navigateur
 * joint son jeton Firebase (Authorization: Bearer <idToken>) et on contrôle sa
 * signature côté serveur. Sans cela, connaître un uid suffirait à agir en son nom.
 */
export async function verifyRequestUid(uid: string | null | undefined): Promise<boolean> {
  if (!uid) return false;
  try {
    // Appel INTERNE de nos propres tâches planifiées (ex. facturation récurrente) : secret serveur
    // + uid explicite. Jamais utilisable depuis un navigateur (le secret n'est pas exposé).
    const internalSecret = process.env.INTERNAL_API_SECRET || process.env.CRON_RECONCILE_SECRET;
    const h = await headers();
    if (internalSecret && h.get("x-vpz-internal") === internalSecret && h.get("x-vpz-internal-uid") === uid) return true;

    const authz = (await headers()).get("authorization") ?? "";
    const match = authz.match(/^Bearer (.+)$/i);
    if (!match) return false;
    const decoded = await (await adminAuth()).verifyIdToken(match[1]);
    return decoded.uid === uid;
  } catch {
    return false;
  }
}
