import { adminDb } from "@/lib/firebase-admin";

/** Entreprise si `uid` en est membre, sinon null. */
export async function getMemberCompany(uid: string, companyId: string) {
  const ref = adminDb().collection("companies").doc(companyId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data || !Array.isArray(data.members) || !data.members.includes(uid)) return null;
  return { ref, data };
}

export const KYC_REQUIRED_MESSAGE =
  "Vous n'êtes pas autorisé : la vérification d'identité de l'entreprise doit d'abord être validée.";
