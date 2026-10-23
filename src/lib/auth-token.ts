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
    const authz = (await headers()).get("authorization") ?? "";
    const match = authz.match(/^Bearer (.+)$/i);
    if (!match) return false;
    const decoded = await (await adminAuth()).verifyIdToken(match[1]);
    return decoded.uid === uid;
  } catch {
    return false;
  }
}
