import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { contactSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isSpamContact } from "@/lib/spam";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { name, email, subject, message, source, uid, companyId } = parseOrThrow(contactSchema, raw);

    // Anti-spam : messages aléatoires (ex. "JdGfuYjkbbpofRHvSmBrXjk"). Réponse
    // OK silencieuse : rien n'est enregistré ni envoyé, et le spammeur n'est pas informé.
    if (isSpamContact({ name, subject, message })) {
      return NextResponse.json({ ok: true });
    }

    // Anti-spam : limite par IP (formulaire public, pas d'authentification requise)
    const ip = getClientIp(req);
    const limited = await checkRateLimit(`contact:ip:${ip}`, 5, 600); // 5 messages / 10 min / IP
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de messages envoyés. Réessayez dans quelques minutes." }, { status: 429 });
    }

    const db = adminDb();
    const msgRef = db.collection("contactMessages").doc();
    await msgRef.set({
      id: msgRef.id,
      name,
      email,
      subject: subject || (source === "support" ? "Demande de support" : "Message de contact"),
      message,
      source,
      uid: uid ?? null,
      companyId: companyId ?? null,
      createdAt: Date.now(),
    });

    // Échappement des caractères HTML actifs avant insertion dans l'email,
    // pour empêcher toute injection de balises via le champ message.
    const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
    const escapedMessage = escapeHtml(String(message).slice(0, 200));
    const escapedSubject = escapeHtml(String(subject ?? "—"));
    const escapedName = escapeHtml(String(name));

    await sendTransactionalEmail({
      to: [{ email, name }],
      subject: "Nous avons bien reçu votre message — Verzapay",
      htmlContent: emailTemplate({
        title: "Message bien reçu",
        body: `Bonjour ${escapedName},<br/><br/>Nous avons bien reçu votre message et reviendrons vers vous dans les plus brefs délais.<br/><br/>Pour une réponse rapide et fiable, contactez-nous aussi sur WhatsApp : <strong>+229 62 75 87 03</strong>.<br/><br/><em>Votre message : "${escapedMessage}"</em>`,
      }),
    });

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      await sendTransactionalEmail({
        to: [{ email: adminEmail }],
        subject: `[${source === "support" ? "Support" : "Contact"}] Nouveau message de ${escapedName}`,
        htmlContent: emailTemplate({
          title: `Nouveau message — ${source === "support" ? "Support" : "Contact"}`,
          body: `<strong>De :</strong> ${escapedName} (${email})<br/><strong>Sujet :</strong> ${escapedSubject}<br/><br/>${escapedMessage}`,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/contact:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
