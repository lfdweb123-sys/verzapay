import crypto from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { SESSION_TTL_MS } from "@/lib/checkout";

// Sessions du checkout hébergé. Conservation MINIMALE :
//  - le document est identifié par le HACHÉ du jeton (une fuite de la base ne donne aucun lien utilisable) ;
//  - le lien du partenaire (carte) n'y reste que le temps nécessaire : effacé dès le paiement réussi ;
//  - la session est supprimée peu après un paiement réussi, ou au bout d'un mois sans paiement.

export const PAID_SESSION_GRACE_MS = 60 * 60 * 1000;          // la page de confirmation reste lisible 1 h
export const UNPAID_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // suppression automatique après un mois

export const sessionIdForToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

/** Interrupteur de secours : HOSTED_CHECKOUT_ENABLED=false => retour immédiat au lien du partenaire. */
export const hostedCheckoutEnabled = (): boolean => process.env.HOSTED_CHECKOUT_ENABLED !== "false";

export const appOrigin = (): string => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export interface NewSession {
  token: string;
  companyId: string;
  txId: string;
  joonapayUuid: string;
  paymentLink: string;
  customerPhone: string;
  customerName?: string;
  description?: string;
}

export async function createCheckoutSession(db: Firestore, s: NewSession): Promise<void> {
  const now = Date.now();
  await db.collection("checkoutSessions").doc(sessionIdForToken(s.token)).set({
    companyId: s.companyId,
    txId: s.txId,
    joonapayUuid: s.joonapayUuid,
    paymentLink: s.paymentLink,
    customerPhone: s.customerPhone,
    customerName: s.customerName ?? "",
    description: s.description ?? "",
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    paid: false,
    purgeAfter: null,
    attempt: null,
  });
}

export async function getSessionByToken(db: Firestore, token: string) {
  const ref = db.collection("checkoutSessions").doc(sessionIdForToken(token));
  const snap = await ref.get();
  return snap.exists ? { ref, data: snap.data()! } : null;
}

/** Paiement réussi : le lien est effacé immédiatement, la session disparaîtra après un court délai. */
export async function markSessionPaid(db: Firestore, txId: string): Promise<void> {
  try {
    const snap = await db.collection("checkoutSessions").where("txId", "==", txId).limit(5).get();
    const FieldValue = (await import("firebase-admin/firestore")).FieldValue;
    await Promise.all(
      snap.docs.map((d) =>
        d.ref.update({ paid: true, paidAt: Date.now(), purgeAfter: Date.now() + PAID_SESSION_GRACE_MS, paymentLink: FieldValue.delete(), attempt: null })
      )
    );
  } catch (err) {
    console.error("[checkout-session] markSessionPaid (non bloquant):", err);
  }
}
