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

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { adminUid, targetUid, decision } = parseOrThrow(schema, raw);

    if (!(await requireAdmin(adminUid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const userData = userSnap.data()!;
    const pendingEmail = userData.pendingEmail;
    if (!pendingEmail) return NextResponse.json({ error: "Aucune demande de changement en attente" }, { status: 400 });

    if (decision === "approve") {
      const auth = await adminAuth();
      await auth.updateUser(targetUid, { email: pendingEmail });
      await userRef.update({ email: pendingEmail, pendingEmail: null, pendingEmailRequestedAt: null });

      await sendTransactionalEmail({
        to: [{ email: pendingEmail, name: userData.displayName }],
        subject: "Votre adresse email a été mise à jour",
        htmlContent: emailTemplate({
          title: "Email mis à jour",
          body: `Votre adresse email a été changée vers <strong>${pendingEmail}</strong> par l'administration Verzapay. Utilisez cette nouvelle adresse pour vous connecter.`,
        }),
      });

      return NextResponse.json({ ok: true, newEmail: pendingEmail });
    } else {
      await userRef.update({ pendingEmail: null, pendingEmailRequestedAt: null });

      await sendTransactionalEmail({
        to: [{ email: userData.email, name: userData.displayName }],
        subject: "Demande de changement d'email refusée",
        htmlContent: emailTemplate({
          title: "Demande refusée",
          body: `Votre demande de changement d'email vers <strong>${pendingEmail}</strong> a été refusée par l'administration. Contactez le support pour plus d'informations.`,
        }),
      });

      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("POST /api/admin/change-email:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
