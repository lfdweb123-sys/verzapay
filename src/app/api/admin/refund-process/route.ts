import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { parseOrThrow } from "@/lib/validation";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";

const schema = z.object({
  adminUid: z.string().min(1),
  refundId: z.string().min(1),
  action: z.enum(["complete", "reject"]),
  note: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const { adminUid, refundId, action, note } = parseOrThrow(schema, await req.json());
    if (!(await requireAdmin(adminUid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const refundRef = db.collection("refunds").doc(refundId);

    const refund = await db.runTransaction(async (t) => {
      const rSnap = await t.get(refundRef);
      const r = rSnap.data();
      if (!rSnap.exists || !r) throw new Error("NOT_FOUND");
      if (r.status !== "pending") throw new Error("ALREADY_PROCESSED");

      if (action === "complete") {
        t.update(refundRef, { status: "completed", processedAt: Date.now(), adminNote: note ?? null, processedBy: adminUid });
        return r;
      }
      // Rejet : le montant réservé retourne sur le portefeuille et la transaction redevient remboursable
      const companyRef = db.collection("companies").doc(r.companyId);
      const txRef = companyRef.collection("transactions").doc(r.txId);
      const [cSnap, txSnap] = await Promise.all([t.get(companyRef), t.get(txRef)]);
      const balance = Number(cSnap.data()?.walletBalance ?? 0) + Number(r.amount);
      t.update(companyRef, { walletBalance: balance });
      t.update(txRef, { refundedAmount: Math.max(0, Number(txSnap.data()?.refundedAmount ?? 0) - Number(r.amount)) });
      t.set(companyRef.collection("ledger").doc(), {
        type: "credit", amount: Number(r.amount), balanceAfter: balance, reference: refundId,
        label: "Remboursement refusé — montant recrédité", createdAt: Date.now(),
      });
      t.update(refundRef, { status: "rejected", processedAt: Date.now(), adminNote: note ?? null, processedBy: adminUid });
      return r;
    });

    try {
      const done = action === "complete";
      const label = `${Number(refund.amount).toLocaleString("fr-FR")} XOF`;
      await sendPushAndStore({
        uid: refund.requestedBy, companyId: refund.companyId,
        title: done ? "Remboursement effectué" : "Remboursement refusé",
        body: done ? `Le remboursement de ${label} a été effectué au client.` : `Le remboursement de ${label} a été refusé et recrédité sur votre portefeuille.${note ? ` Motif : ${note}` : ""}`,
        type: "payment",
      });
      const user = (await db.collection("users").doc(refund.requestedBy).get()).data();
      if (user?.email) {
        await sendTransactionalEmail({
          to: [{ email: user.email, name: user.displayName }],
          subject: done ? `Remboursement de ${label} effectué` : `Remboursement de ${label} refusé`,
          htmlContent: emailTemplate({
            title: done ? "Remboursement effectué" : "Remboursement refusé",
            body: done ? `Le remboursement de <strong>${label}</strong> a été effectué au client.` : `Le remboursement de <strong>${label}</strong> a été refusé. Le montant a été recrédité sur votre portefeuille.${note ? `<br/><br/>Motif : ${note}` : ""}`,
            ctaLabel: "Voir mes remboursements", ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/refunds`,
          }),
        });
      }
    } catch (e) {
      console.error("refund-process notification:", e);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const m = err instanceof Error ? err.message : "";
    if (m === "NOT_FOUND") return NextResponse.json({ error: "Remboursement introuvable" }, { status: 404 });
    if (m === "ALREADY_PROCESSED") return NextResponse.json({ error: "Déjà traité" }, { status: 409 });
    console.error("POST /api/admin/refund-process:", err);
    return NextResponse.json({ error: m.startsWith("Donnée invalide") ? m : "Une erreur est survenue" }, { status: m.startsWith("Donnée invalide") ? 400 : 500 });
  }
}
