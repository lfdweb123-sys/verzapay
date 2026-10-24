import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { teamInviteSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";
import { verifyRequestUid } from "@/lib/auth-token";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { companyId, uid, email, role } = parseOrThrow(teamInviteSchema, raw);
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }


    const limited = await checkRateLimit(`team-invite:uid:${uid}`, 20, 3600); // 20 invitations / heure
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop d'invitations envoyées. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;
    if (company.kycStatus !== "approved") {
      return NextResponse.json({ error: "Vous n'êtes pas autorisé : la vérification d'identité de l'entreprise doit d'abord être validée." }, { status: 403 });
    }
    if (company.ownerUid !== uid) {
      return NextResponse.json({ error: "Seul le propriétaire peut inviter des membres" }, { status: 403 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const inviteRef = db.collection("companies").doc(companyId).collection("invites").doc();
    await inviteRef.set({
      id: inviteRef.id,
      companyId,
      email: email.toLowerCase().trim(),
      role,
      invitedBy: uid,
      status: "pending",
      createdAt: Date.now(),
      token,
    });

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/team/accept?inviteId=${inviteRef.id}&companyId=${companyId}&token=${token}`;

    await sendTransactionalEmail({
      to: [{ email }],
      subject: `Invitation à rejoindre ${company.name} sur Verzapay`,
      htmlContent: emailTemplate({
        title: `Vous êtes invité(e) à rejoindre ${company.name}`,
        body: `Vous avez été invité(e) en tant que <strong>${role === "Admin" ? "Administrateur" : "Membre"}</strong> sur l'espace Verzapay de <strong>${company.name}</strong>. Cliquez sur le bouton ci-dessous pour accepter l'invitation.`,
        ctaLabel: "Accepter l'invitation",
        ctaUrl: inviteUrl,
      }),
    });

    return NextResponse.json({ ok: true, inviteId: inviteRef.id });
  } catch (err) {
    console.error("POST /api/team/invite:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
