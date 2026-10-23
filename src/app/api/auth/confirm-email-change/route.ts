import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { z } from "zod";
import { parseOrThrow } from "@/lib/validation";
import { verifyRequestUid } from "@/lib/auth-token";

const schema = z.object({
  uid: z.string().min(1),
  code: z.string().length(6),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, code } = parseOrThrow(schema, raw);
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }


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

    // IMPORTANT : on révoque tous les refresh tokens émis avant ce changement.
    // Sans ça, une session Firebase Auth déjà active côté client (token en
    // IndexedDB) reste valide après le changement d'email : au reload sur
    // /login, le SDK rafraîchit silencieusement le token, onAuthStateChanged
    // renvoie un user toujours "connecté", et l'utilisateur est redirigé
    // directement vers /verify-2fa puis le dashboard au lieu de repasser
    // par l'écran de connexion avec sa nouvelle adresse email.
    // On isole cet appel dans son propre try/catch : si revokeRefreshTokens
    // plante (mise à jour de dépendance jose/jwks-rsa, etc.), l'email a déjà
    // été mis à jour et le doc Firestore aussi — on ne veut pas masquer ce
    // succès par un 500 trompeur.
    try {
      await auth.revokeRefreshTokens(uid);
    } catch (revokeErr) {
      console.error(
        "revokeRefreshTokens a échoué après updateUser (email déjà mis à jour) :",
        revokeErr
      );
    }

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