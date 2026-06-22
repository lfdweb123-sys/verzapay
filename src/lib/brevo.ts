const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface SendEmailParams {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
}

export async function sendTransactionalEmail({ to, subject, htmlContent }: SendEmailParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY manquante — email non envoyé:", subject);
    return;
  }

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || "Verzapay",
        email: process.env.BREVO_SENDER_EMAIL || "no-reply@verzapay.com",
      },
      to,
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Brevo error ${res.status}: ${text}`);
  }
}

export function emailTemplate(opts: { title: string; body: string; ctaLabel?: string; ctaUrl?: string }): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#F1EFE8; padding:32px;">
    <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #E4E2DA;">
      <div style="background:#0C447C; padding:24px 32px;">
        <span style="color:#ffffff; font-size:18px; font-weight:600;">Verzapay</span>
      </div>
      <div style="padding:32px;">
        <h1 style="font-size:18px; color:#1A1A19; margin:0 0 16px;">${opts.title}</h1>
        <p style="font-size:14px; line-height:1.6; color:#5F5E5A; margin:0 0 24px;">${opts.body}</p>
        ${
          opts.ctaUrl
            ? `<a href="${opts.ctaUrl}" style="display:inline-block; background:#185FA5; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:8px; font-size:14px; font-weight:500;">${opts.ctaLabel ?? "Voir"}</a>`
            : ""
        }
      </div>
      <div style="padding:16px 32px; background:#F8F8F7; border-top:1px solid #E4E2DA;">
        <p style="font-size:12px; color:#888780; margin:0;">Verzapay — La passerelle de paiement pensée pour l'Afrique</p>
      </div>
    </div>
  </div>`;
}
