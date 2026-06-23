import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { z } from "zod";
import { parseOrThrow } from "@/lib/validation";

const schema = z.object({
  adminUid: z.string().min(1),
  targetUid: z.string().min(1),
  action: z.enum(["disable", "enable", "delete"]),
  reason: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { adminUid, targetUid, action, reason } = parseOrThrow(schema, raw);

    if (!(await requireAdmin(adminUid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (adminUid === targetUid) {
      return NextResponse.json({ error: "Vous ne pouvez pas agir sur votre propre compte" }, { status: 400 });
    }

    const db = adminDb();
    const auth = await adminAuth();

    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const userData = userSnap.data()!;

    if (action === "disable") {
      // Désactiver dans Firebase Auth (bloque la connexion)
      await auth.updateUser(targetUid, { disabled: true });
      
      // Marquer dans Firestore
      await userRef.update({ 
        disabled: true, 
        disabledAt: Date.now(), 
        disabledReason: reason ?? null 
      });
      
      // Suspendre aussi toutes les entreprises de ce marchand
      const companiesSnap = await db.collection("companies")
        .where("ownerUid", "==", targetUid).get();
      
      const batch = db.batch();
      companiesSnap.docs.forEach((d) => {
        batch.update(d.ref, { 
          suspended: true, 
          suspendedReason: reason ?? "Compte marchand désactivé par l'administration" 
        });
      });
      await batch.commit();

      // Notifier le marchand
      if (userData.email) {
        await sendTransactionalEmail({
          to: [{ email: userData.email, name: userData.displayName }],
          subject: "Votre compte Verzapay a été désactivé",
          htmlContent: emailTemplate({
            title: "Compte désactivé",
            body: `Votre compte Verzapay a été désactivé par l'administration.${reason ? ` Motif : <strong>${reason}</strong>.` : ""} Contactez notre support pour plus d'informations.`,
          }),
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "enable") {
      await auth.updateUser(targetUid, { disabled: false });
      await userRef.update({ 
        disabled: false, 
        disabledAt: null, 
        disabledReason: null 
      });
      
      // Réactiver les entreprises
      const companiesSnap = await db.collection("companies")
        .where("ownerUid", "==", targetUid).get();
      
      const batch = db.batch();
      companiesSnap.docs.forEach((d) => {
        batch.update(d.ref, { 
          suspended: false, 
          suspendedReason: null 
        });
      });
      await batch.commit();

      if (userData.email) {
        await sendTransactionalEmail({
          to: [{ email: userData.email, name: userData.displayName }],
          subject: "Votre compte Verzapay a été réactivé",
          htmlContent: emailTemplate({
            title: "Compte réactivé",
            body: "Votre compte Verzapay a été réactivé. Vous pouvez à nouveau vous connecter et utiliser toutes les fonctionnalités.",
            ctaLabel: "Se connecter",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
          }),
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      // Supprimer de Firebase Auth (connexion impossible)
      await auth.deleteUser(targetUid);
      
      // Marquer dans Firestore comme supprimé (garder les données pour traçabilité)
      await userRef.update({ 
        deleted: true, 
        deletedAt: Date.now(), 
        email: `[supprimé] ${userData.email}` 
      });
      
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/admin/manage-merchant:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json(
      { error: isValidationError ? message : "Une erreur est survenue" }, 
      { status: isValidationError ? 400 : 500 }
    );
  }
}