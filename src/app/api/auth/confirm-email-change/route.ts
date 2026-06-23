import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { z } from "zod";
import { parseOrThrow } from "@/lib/validation";

const schema = z.object({
  uid: z.string().min(1),
  code: z.string().length(6),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, code } = parseOrThrow(schema, raw);

    const db = adminDb();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const data = userSnap.data()!;

    if (!data.emailChangePending)
      return NextResponse.json({ error: "Aucune confirmation en attente" }, { status: 400 });

    if (!data.emailChangeCode || data.emailChangeCode !== code)
      return NextResponse.json({ error: "Code incorrect" }, { status: 400 });

    if (!data.emailChangeCodeExpiresAt || Date.now() > data.emailChangeCodeExpiresAt)
      return NextResponse.json({ error: "Code expiré. Contactez l'administration." }, { status: 400 });

    const newEmail = data.pendingEmail;

    // Appliquer le changement
    const auth = await adminAuth();
    await auth.updateUser(uid, { email: newEmail });

    await userRef.update({
      email: newEmail,
      pendingEmail: null,
      pendingEmailRequestedAt: null,
      emailChangeCode: null,
      emailChangeCodeExpiresAt: null,
      emailChangePending: false,
    });

    // Email de confirmation final
    await sendTransactionalEmail({
      to: [{ email: newEmail, name: data.displayName }],
      subject: "Votre adresse email a été mise à jour",
      htmlContent: emailTemplate({
        title: "Email mis à jour",
        body: `Votre adresse email a bien été changée vers <strong>${newEmail}</strong>. Vous pouvez maintenant vous connecter avec cette adresse.`,
      }),
    });

    return NextResponse.json({ ok: true, newEmail });
  } catch (err) {
    console.error("POST /api/auth/confirm-email-change:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidation = message.startsWith("Donnée invalide");
    return NextResponse.json(
      { error: isValidation ? message : "Une erreur est survenue" },
      { status: isValidation ? 400 : 500 }
    );
  }
}