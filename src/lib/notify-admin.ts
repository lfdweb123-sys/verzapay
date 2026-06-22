import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";

interface NotifyAdminParams {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

/**
 * Envoie un email à l'adresse admin dédiée (ADMIN_NOTIFICATION_EMAIL) pour
 * toute action marchand nécessitant une attention rapide : nouvelle inscription,
 * demande KYC, demande de retrait, message de contact, etc.
 */
export async function notifyAdmin(params: NotifyAdminParams): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    console.warn("ADMIN_NOTIFICATION_EMAIL non configuré — notification admin ignorée:", params.title);
    return;
  }
  await sendTransactionalEmail({
    to: [{ email: adminEmail }],
    subject: `[Verzapay Admin] ${params.title}`,
    htmlContent: emailTemplate({
      title: params.title,
      body: params.body,
      ctaLabel: params.ctaLabel,
      ctaUrl: params.ctaUrl,
    }),
  });
}
