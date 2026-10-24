import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { parseOrThrow } from "@/lib/validation";
import { adminDb } from "@/lib/firebase-admin";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";

const schema = z.object({
  adminUid: z.string().min(1),
  companyId: z.string().min(1),
  payoutId: z.string().min(1),
  action: z.enum(["complete", "reject"]),
  note: z.string().max(500).optional().nullable(),
});

// Traitement MANUEL d'un virement bancaire par l'admin :
//  - complete : le virement a été effectué → statut "completed"
//  - reject   : le virement est refusé → le portefeuille est remboursé, statut "rejected"
export async function POST(req: NextRequest) {
  try {
    const { adminUid, companyId, payoutId, action, note } = parseOrThrow(schema, await req.json());
    if (!(await requireAdmin(adminUid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const poRef = companyRef.collection("payouts").doc(payoutId);

    const result = await db.runTransaction(async (tx) => {
      const [poSnap, companySnap] = await Promise.all([tx.get(poRef), tx.get(companyRef)]);
      if (!poSnap.exists || !companySnap.exists) throw new Error("NOT_FOUND");
      const po = poSnap.data()!;
      if (po.method !== "bank_transfer" || po.manual !== true) throw new Error("NOT_MANUAL");
      if (po.status !== "pending") throw new Error("ALREADY_PROCESSED");

      if (action === "complete") {
        tx.update(poRef, { status: "completed", processedAt: Date.now(), approvedBy: adminUid, adminNote: note ?? null });
        return { po, company: companySnap.data()!, balanceAfter: null as number | null };
      }

      // Rejet : remboursement du montant réservé
      const balance = Number(companySnap.data()!.walletBalance ?? 0);
      const balanceAfter = balance + Number(po.amount);
      tx.update(companyRef, { walletBalance: balanceAfter });
      tx.update(poRef, { status: "rejected", processedAt: Date.now(), approvedBy: adminUid, adminNote: note ?? null });
      tx.set(companyRef.collection("ledger").doc(), {
        type: "credit",
        amount: Number(po.amount),
        balanceAfter,
        reference: payoutId,
        label: "Remboursement — virement bancaire refusé",
        createdAt: Date.now(),
      });
      return { po, company: companySnap.data()!, balanceAfter };
    });

    // Les coordonnées bancaires complètes ne sont plus nécessaires une fois le virement traité
    await companyRef.collection("payoutSecrets").doc(payoutId).delete().catch(() => undefined);

    // Notifications au demandeur (hors transaction, non bloquantes)
    try {
      const requesterUid: string = result.po.requestedBy;
      const amountLabel = `${Number(result.po.requestedAmount ?? result.po.amount).toLocaleString("fr-FR")} ${result.po.requestedCurrency ?? "XOF"}`;
      const done = action === "complete";
      await sendPushAndStore({
        uid: requesterUid,
        companyId,
        title: done ? "Virement bancaire effectué" : "Virement bancaire refusé",
        body: done
          ? `Votre virement de ${amountLabel} vers ${result.po.recipientBank ?? "votre banque"} a été effectué.`
          : `Votre virement de ${amountLabel} a été refusé et le montant a été remboursé sur votre portefeuille.${note ? ` Motif : ${note}` : ""}`,
        type: "payout",
      });
      const user = (await db.collection("users").doc(requesterUid).get()).data();
      if (user?.email) {
        await sendTransactionalEmail({
          to: [{ email: user.email, name: user.displayName }],
          subject: done ? `Virement de ${amountLabel} effectué` : `Virement de ${amountLabel} refusé`,
          htmlContent: emailTemplate({
            title: done ? "Virement effectué" : "Virement refusé",
            body: done
              ? `Votre virement bancaire de <strong>${amountLabel}</strong> vers <strong>${result.po.recipientBank ?? "votre banque"}</strong> a été effectué.`
              : `Votre virement bancaire de <strong>${amountLabel}</strong> n'a pas pu être effectué. Le montant a été remboursé sur votre portefeuille.${note ? `<br/><br/>Motif : ${note}` : ""}`,
            ctaLabel: "Voir mes décaissements",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payouts`,
          }),
        });
      }
    } catch (notifyErr) {
      console.error("payout-manual notification:", notifyErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "Décaissement introuvable" }, { status: 404 });
    if (msg === "NOT_MANUAL") return NextResponse.json({ error: "Ce décaissement n'est pas un virement manuel" }, { status: 400 });
    if (msg === "ALREADY_PROCESSED") return NextResponse.json({ error: "Ce virement a déjà été traité" }, { status: 409 });
    console.error("POST /api/admin/payout-manual:", err);
    const isValidationError = msg.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? msg : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
