import { adminDb } from "@/lib/firebase-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

/**
 * Email à l'équipe quand une entreprise soumet ses documents (stage "pending") ou passe en
 * révision manuelle (stage "review"). Une seule alerte par entreprise et par étape, même si le
 * partenaire renvoie le webhook. Jamais bloquant.
 */
export async function notifyKycSubmission(companyId: string, stage: "pending" | "review"): Promise<void> {
  try {
    const db = adminDb();
    const ref = db.collection("companies").doc(companyId);
    const company = (await ref.get()).data();
    if (!company) return;

    const flag = `kycAlertSent_${stage}`;
    if (company[flag]) return;
    await ref.update({ [flag]: Date.now() });

    const owner = company.ownerUid ? (await db.collection("users").doc(company.ownerUid).get()).data() : null;
    const to = process.env.KYC_ALERT_EMAIL || "lfdweb123@gmail.com";
    const label = stage === "pending" ? "Nouveaux documents soumis" : "Vérification en révision manuelle";

    await sendTransactionalEmail({
      to: [{ email: to }],
      subject: `${label} — ${company.name ?? "entreprise"}`,
      htmlContent: emailTemplate({
        title: `Nouvelle vérification d'entreprise`,
        body: [
          `<strong>${label}</strong>`,
          `<strong>Entreprise :</strong> ${esc(String(company.name ?? "—"))}`,
          `<strong>Pays :</strong> ${esc(String(company.country ?? "—"))}`,
          `<strong>Propriétaire :</strong> ${esc(String(owner?.displayName ?? "—"))} (${esc(String(owner?.email ?? "—"))})`,
          stage === "review" ? `<br/>Une décision est attendue dans l'espace admin.` : `<br/>L'analyse automatique est en cours.`,
        ].join("<br/>"),
        ctaLabel: "Ouvrir l'admin",
        ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/companies`,
      }),
    });
  } catch (err) {
    console.error("[kyc-alert] non bloquant:", err);
  }
}
