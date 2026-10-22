import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { sendPushAndStore } from "@/lib/push";
import { adminSendMessageSchema, parseOrThrow } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { adminUid, target, targetUid, subject, message, sendEmail, sendPush } = parseOrThrow(adminSendMessageSchema, raw);

    if (!(await requireAdmin(adminUid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (!sendEmail && !sendPush) return NextResponse.json({ error: "Sélectionnez au moins un canal d'envoi" }, { status: 400 });
    if (target === "single" && !targetUid) return NextResponse.json({ error: "Destinataire manquant" }, { status: 400 });

    const db = adminDb();

    let recipients: { uid: string; email: string; displayName: string }[] = [];

    if (target === "single" && targetUid) {
      const snap = await db.collection("users").doc(targetUid).get();
      if (!snap.exists) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
      const data = snap.data()!;
      recipients = [{ uid: targetUid, email: data.email, displayName: data.displayName ?? "Marchand" }];
    } else if (target === "unverified") {
      // Utilisateurs dont aucune entreprise n'a un KYC approuvé (identité non vérifiée)
      const approvedSnap = await db.collection("companies").where("kycStatus", "==", "approved").get();
      const verifiedUids = new Set<string>();
      for (const c of approvedSnap.docs) {
        const data = c.data();
        if (data.ownerUid) verifiedUids.add(data.ownerUid);
        if (Array.isArray(data.members)) data.members.forEach((m: string) => verifiedUids.add(m));
      }
      const snap = await db.collection("users").limit(1000).get();
      recipients = snap.docs
        .filter((d) => !verifiedUids.has(d.id))
        .map((d) => ({ uid: d.id, email: d.data().email, displayName: d.data().displayName ?? "Marchand" }));
    } else {
      const snap = await db.collection("users").limit(1000).get();
      recipients = snap.docs.map((d) => ({ uid: d.id, email: d.data().email, displayName: d.data().displayName ?? "Marchand" }));
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: "Aucun destinataire trouvé" }, { status: 404 });
    }

    let emailsSent = 0;
    let pushSent = 0;

    const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");

    for (const r of recipients) {
      if (sendEmail && r.email) {
        await sendTransactionalEmail({
          to: [{ email: r.email, name: r.displayName }],
          subject,
          htmlContent: emailTemplate({ title: subject, body: safeMessage }),
        });
        emailsSent++;
      }
      if (sendPush) {
        await sendPushAndStore({
          uid: r.uid,
          title: subject,
          body: message.slice(0, 150),
          type: "admin",
        });
        pushSent++;
      }
    }

    return NextResponse.json({ ok: true, recipientsCount: recipients.length, emailsSent, pushSent });
  } catch (err) {
    console.error("POST /api/admin/send-message:", err);
    const errMessage = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = errMessage.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? errMessage : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
