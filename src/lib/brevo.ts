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
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${opts.title}</title>
<style>
  body, table, td { margin: 0; padding: 0; }
  body {
    background: #F1EFE8;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .container {
    max-width: 480px;
    margin: 0 auto;
  }
  .card {
    background: #ffffff;
    border: 1px solid #E4E2DA;
  }
  .content {
    padding: 32px;
  }
  h1.title {
    font-size: 18px;
    color: #1A1A19;
    margin: 0 0 16px;
  }
  p.body-text {
    font-size: 14px;
    line-height: 1.6;
    color: #5F5E5A;
    margin: 0 0 24px;
  }
  .cta {
    display: inline-block;
    background: #185FA5;
    color: #ffffff !important;
    text-decoration: none;
    padding: 12px 22px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
  }
  .code-box {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 8px;
    text-align: center;
    margin: 24px 0;
    color: #1A1A19;
  }
  @media only screen and (max-width: 480px) {
    .container { width: 100% !important; }
    .content { padding: 24px 20px !important; }
    h1.title { font-size: 16px !important; }
    p.body-text { font-size: 13px !important; }
    .cta { display: block !important; text-align: center; padding: 14px 0 !important; }
    .code-box { font-size: 26px !important; letter-spacing: 5px !important; }
  }
</style>
</head>
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFE8; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="480" cellpadding="0" cellspacing="0" class="card" style="background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #E4E2DA;">
          <tr>
            <td style="background:#0C447C; padding:20px 32px;">
              <span style="color:#ffffff; font-size:18px; font-weight:600;">Verzapay</span>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="title">${opts.title}</h1>
              <p class="body-text">${opts.body}</p>
              ${
                opts.ctaUrl
                  ? `<a href="${opts.ctaUrl}" class="cta">${opts.ctaLabel ?? "Voir"}</a>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px; background:#F8F8F7; border-top:1px solid #E4E2DA;">
              <p style="font-size:12px; color:#888780; margin:0;">Verzapay — La passerelle de paiement pensée pour l'Afrique</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}