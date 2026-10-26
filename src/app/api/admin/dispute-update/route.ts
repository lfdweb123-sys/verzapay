import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { parseOrThrow } from "@/lib/validation";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";

const schema = z.object({
  adminUid: z.string().min(1),
  disputeId: z.string().min(1),
  text: z.string().max(2000).optional(),
  status: z.enum(["open", "under_review", "resolved", "rejected"]).optional(),
});

const STATUS_FR = { open: "ouvert", under_review: "en cours d'examen", resolved: "résolu en votre faveur", rejected: "rejeté" } as const;

export async function POST(req: NextRequest) {
  try {
    const { adminUid, disputeId, text, status } = parseOrThrow(schema, await req.json());
    if (!(await requireAdmin(adminUid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (!text && !status) return NextResponse.json({ error: "Rien à mettre à jour" }, { status: 400 });

    const db = adminDb();
    const ref = db.collection("disputes").doc(disputeId);
    const snap = await ref.get();
    const d = snap.data();
    if (!snap.exists || !d) return NextResponse.json({ error: "Litige introuvable" }, { status: 404 });

    if (text) await ref.collection("messages").add({ from: "support", authorName: "Équipe Verzapay", text, createdAt: Date.now() });
    await ref.update({ updatedAt: Date.now(), ...(status ? { status, resolution: ["resolved", "rejected"].includes(status) ? status : null } : {}) });

    try {
      const summary = status ? `Votre litige est ${STATUS_FR[status]}.${text ? ` ${text}` : ""}` : `Nouveau message de l'équipe Verzapay : ${text}`;
      await sendPushAndStore({ uid: d.openedBy, companyId: d.companyId, title: "Litige mis à jour", body: summary.slice(0, 200), type: "system" });
      const user = (await db.collection("users").doc(d.openedBy).get()).data();
      if (user?.email) {
        await sendTransactionalEmail({
          to: [{ email: user.email, name: user.displayName }],
          subject: "Mise à jour de votre litige",
          htmlContent: emailTemplate({ title: "Mise à jour de votre litige", body: summary.replace(/[<>&]/g, ""), ctaLabel: "Voir le litige", ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/disputes` }),
        });
      }
    } catch (e) {
      console.error("dispute-update notification:", e);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/dispute-update:", err);
    const m = err instanceof Error ? err.message : "";
    return NextResponse.json({ error: m.startsWith("Donnée invalide") ? m : "Une erreur est survenue" }, { status: m.startsWith("Donnée invalide") ? 400 : 500 });
  }
}
