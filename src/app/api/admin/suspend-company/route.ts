import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { suspendCompanySchema, parseOrThrow } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { adminUid, companyId, suspended, reason } = parseOrThrow(suspendCompanySchema, raw);

    if (!(await requireAdmin(adminUid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;

    await companyRef.update({
      suspended,
      suspendedAt: suspended ? Date.now() : null,
      suspendedReason: suspended ? (reason ?? null) : null,
    });

    const title = suspended ? "Compte suspendu" : "Compte réactivé";
    const body = suspended
      ? `Votre entreprise <strong>${company.name}</strong> a été suspendue par l'administration. Les paiements et retraits sont désactivés. ${reason ? `Motif : ${reason}` : ""} Contactez le support pour plus d'informations.`
      : `Votre entreprise <strong>${company.name}</strong> a été réactivée. Vous pouvez à nouveau encaisser et retirer des fonds.`;

    await sendPushAndStore({
      uid: company.ownerUid,
      companyId,
      title,
      body,
      type: "admin",
      link: "/dashboard",
    });

    const ownerSnap = await db.collection("users").doc(company.ownerUid).get();
    const ownerEmail = ownerSnap.data()?.email;
    if (ownerEmail) {
      await sendTransactionalEmail({
        to: [{ email: ownerEmail, name: ownerSnap.data()?.displayName }],
        subject: title,
        htmlContent: emailTemplate({ title, body, ctaLabel: "Voir le tableau de bord", ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard` }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/suspend-company:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
