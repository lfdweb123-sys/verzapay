import { adminDb } from "@/lib/firebase-admin";
import { notifyAdmin } from "@/lib/notify-admin";

/**
 * Alerte anti-fraude "légère" : ne bloque RIEN. Quand un gros paiement est
 * encaissé, un email est envoyé à l'admin principal (ADMIN_NOTIFICATION_EMAIL)
 * pour qu'il vérifie la provenance des fonds manuellement.
 *
 * Seuils (modifiables via variables d'environnement) :
 *  - XOF / XAF : FRAUD_ALERT_THRESHOLD_XOF (défaut 500 000)
 *  - USD / EUR : FRAUD_ALERT_THRESHOLD_USD (défaut 1 000)
 * Les autres devises ne déclenchent pas d'alerte (pas de seuil comparable).
 */
function thresholdFor(currency: string): number | null {
  const cur = (currency || "XOF").toUpperCase();
  if (cur === "XOF" || cur === "XAF") return Number(process.env.FRAUD_ALERT_THRESHOLD_XOF) || 500_000;
  if (cur === "USD" || cur === "EUR") return Number(process.env.FRAUD_ALERT_THRESHOLD_USD) || 1_000;
  return null;
}

const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

export interface LargePaymentInfo {
  companyId: string;
  paymentId: string;
  amount: number;
  currency?: string | null;
  method?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  merchantReference?: string | null;
}

/** Jamais bloquant : toute erreur est seulement journalisée. */
export async function alertLargePaymentSafe(info: LargePaymentInfo): Promise<void> {
  try {
    const currency = (info.currency ?? "XOF").toUpperCase();
    const threshold = thresholdFor(currency);
    if (threshold === null || !(info.amount >= threshold)) return;

    let companyName = info.companyId;
    let ownerLine = "—";
    try {
      const db = adminDb();
      const companySnap = await db.collection("companies").doc(info.companyId).get();
      const company = companySnap.data();
      companyName = String(company?.name ?? info.companyId);
      if (company?.ownerUid) {
        const owner = (await db.collection("users").doc(company.ownerUid).get()).data();
        ownerLine = `${escapeHtml(String(owner?.displayName ?? "—"))} (${escapeHtml(String(owner?.email ?? "—"))})`;
      }
    } catch (lookupErr) {
      console.error("[fraud-alert] lecture entreprise:", lookupErr);
    }

    const amountLabel = `${info.amount.toLocaleString("fr-FR")} ${currency}`;
    const lines = [
      `<strong>Montant :</strong> ${amountLabel}`,
      `<strong>Entreprise :</strong> ${escapeHtml(companyName)}`,
      `<strong>Propriétaire :</strong> ${ownerLine}`,
      `<strong>Client :</strong> ${escapeHtml(info.customerName ?? "—")} · ${escapeHtml(info.customerPhone ?? "—")} · ${escapeHtml(info.customerEmail ?? "—")}`,
      `<strong>Moyen de paiement :</strong> ${escapeHtml(info.method ?? "—")}`,
      `<strong>Transaction :</strong> ${escapeHtml(info.paymentId)}${info.merchantReference ? ` (réf. marchand : ${escapeHtml(info.merchantReference)})` : ""}`,
      `<br/>Aucune action automatique n'a été prise : le paiement est traité normalement. Vérifiez la provenance manuellement si nécessaire.`,
    ];

    await notifyAdmin({
      title: `Gros paiement reçu — ${amountLabel}`,
      body: lines.join("<br/>"),
      ctaLabel: "Voir les transactions",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/transactions`,
    });
  } catch (err) {
    console.error("[fraud-alert] échec (non bloquant):", err);
  }
}
