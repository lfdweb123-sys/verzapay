import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { z } from "zod";
import { parseOrThrow } from "@/lib/validation";

const schema = z.object({
  adminUid: z.string().min(1),
  targetUid: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
});

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { adminUid, targetUid, decision } = parseOrThrow(schema, raw);

    if (!(await requireAdmin(adminUid)))
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const userData = userSnap.data()!;
    const pendingEmail = userData.pendingEmail;
    if (!pendingEmail)
      return NextResponse.json({ error: "Aucune demande en attente" }, { status: 400 });

    if (decision === "approve") {
      // Générer un code valable 15 minutes
      const code = generateCode();
      const expiresAt = Date.now() + 15 * 60 * 1000;

      await userRef.update({
        emailChangeCode: code,
        emailChangeCodeExpiresAt: expiresAt,
        emailChangePending: true,
        // pendingEmail reste intact jusqu'à confirmation
      });

      // Envoyer le code au NOUVEAU mail
      await sendTransactionalEmail({
        to: [{ email: pendingEmail, name: userData.displayName }],
        subject: "Confirmez votre nouvelle adresse email — Verzapay",
        htmlContent: emailTemplate({
          title: "Confirmez votre adresse email",
          body: `
            L'administration Verzapay a validé votre demande de changement d'adresse email.<br/><br/>
            Votre code de confirmation est :<br/>
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0;color:#1a1a2e;">${code}</div>
            Ce code est valable <strong>15 minutes</strong>.<br/><br/>
            Reconnectez-vous sur Verzapay avec votre <strong>ancienne adresse email</strong> et saisissez ce code pour finaliser le changement.
          `,
        }),
      });

      // Révoquer les sessions Firebase → déconnexion forcée côté client
      const auth = await adminAuth();
      await auth.revokeRefreshTokens(targetUid);

      return NextResponse.json({ ok: true });
    } else {
      // Refus
      await userRef.update({
        pendingEmail: null,
        pendingEmailRequestedAt: null,
      });

      await sendTransactionalEmail({
        to: [{ email: userData.email, name: userData.displayName }],
        subject: "Demande de changement d'email refusée",
        htmlContent: emailTemplate({
          title: "Demande refusée",
          body: `Votre demande de changement vers <strong>${pendingEmail}</strong> a été refusée. Contactez le support pour plus d'informations.`,
        }),
      });

      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("POST /api/admin/change-email:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidation = message.startsWith("Donnée invalide");
    return NextResponse.json(
      { error: isValidation ? message : "Une erreur est survenue" },
      { status: isValidation ? 400 : 500 }
    );
  }
}