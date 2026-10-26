import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";
import { getMemberCompany, KYC_REQUIRED_MESSAGE } from "@/lib/company-access";
import { parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyAdmin } from "@/lib/notify-admin";

// Remboursements client : la demande réserve le montant sur le portefeuille ; l'équipe Verzapay effectue
// ensuite le remboursement au client et le confirme (ou le rejette : le portefeuille est alors recrédité).

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!(await verifyRequestUid(uid))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!uid || !companyId) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    if (!(await getMemberCompany(uid, companyId))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const [refundsSnap, txSnap] = await Promise.all([
      db.collection("refunds").where("companyId", "==", companyId).limit(200).get(),
      db.collection("companies").doc(companyId).collection("transactions").where("status", "==", "completed").limit(300).get(),
    ]);
    const refunds = refundsSnap.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt);
    const refundable = txSnap.docs
      .map((d) => d.data())
      .map((t) => ({ id: t.id, createdAt: t.createdAt, customerName: t.customerName ?? "", amount: Number(t.amount), remaining: Number(t.amount) - Number(t.refundedAmount ?? 0) }))
      .filter((t) => t.remaining > 0)
      .sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ refunds, refundable });
  } catch (err) {
    console.error("GET /api/refunds:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

const createSchema = z.object({
  uid: z.string().min(1).max(128),
  companyId: z.string().min(1).max(128),
  txId: z.string().min(1).max(128),
  amount: z.coerce.number().finite().positive(),
  reason: z.string().min(3).max(300),
});

export async function POST(req: NextRequest) {
  try {
    const input = parseOrThrow(createSchema, await req.json());
    if (!(await verifyRequestUid(input.uid))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const limited = await checkRateLimit(`refund:${input.uid}`, 20, 3600);
    if (!limited.allowed) return NextResponse.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });

    const access = await getMemberCompany(input.uid, input.companyId);
    if (!access) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (access.data.kycStatus !== "approved") return NextResponse.json({ error: KYC_REQUIRED_MESSAGE }, { status: 403 });

    const db = adminDb();
    const txRef = access.ref.collection("transactions").doc(input.txId);
    const refundRef = db.collection("refunds").doc();
    const amount = Math.round(input.amount);

    let customerName = "";
    let customerPhone = "";
    try {
      await db.runTransaction(async (t) => {
        const [txSnap, companySnap] = await Promise.all([t.get(txRef), t.get(access.ref)]);
        const tx = txSnap.data();
        if (!txSnap.exists || !tx) throw new Error("TX_NOT_FOUND");
        if (tx.status !== "completed") throw new Error("TX_NOT_COMPLETED");
        const remaining = Number(tx.amount) - Number(tx.refundedAmount ?? 0);
        if (amount > remaining) throw new Error(`TOO_MUCH:${remaining}`);
        const balance = Number(companySnap.data()?.walletBalance ?? 0);
        if (balance < amount) throw new Error("INSUFFICIENT_BALANCE");

        customerName = tx.customerName ?? "";
        customerPhone = tx.customerPhone ?? "";
        const newBalance = balance - amount;
        t.update(access.ref, { walletBalance: newBalance });
        t.update(txRef, { refundedAmount: Number(tx.refundedAmount ?? 0) + amount });
        t.set(access.ref.collection("ledger").doc(), {
          type: "debit", amount, balanceAfter: newBalance, reference: refundRef.id,
          label: `Remboursement client — ${customerName || "transaction " + input.txId.slice(0, 8).toUpperCase()}`, createdAt: Date.now(),
        });
        t.set(refundRef, {
          id: refundRef.id, companyId: input.companyId, txId: input.txId, amount, reason: input.reason,
          customerName, customerPhone, status: "pending", requestedBy: input.uid,
          createdAt: Date.now(), processedAt: null, adminNote: null,
        });
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "TX_NOT_FOUND") return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
      if (m === "TX_NOT_COMPLETED") return NextResponse.json({ error: "Seule une transaction réussie peut être remboursée" }, { status: 400 });
      if (m === "INSUFFICIENT_BALANCE") return NextResponse.json({ error: "Solde insuffisant pour ce remboursement" }, { status: 400 });
      if (m.startsWith("TOO_MUCH:")) return NextResponse.json({ error: `Montant trop élevé : ${Number(m.split(":")[1]).toLocaleString("fr-FR")} XOF au maximum remboursable` }, { status: 400 });
      throw e;
    }

    await notifyAdmin({
      title: `Remboursement à effectuer — ${amount.toLocaleString("fr-FR")} XOF`,
      body: [`<strong>Entreprise :</strong> ${access.data.name}`, `<strong>Client :</strong> ${customerName || "—"} · ${customerPhone || "—"}`, `<strong>Montant :</strong> ${amount.toLocaleString("fr-FR")} XOF`, `<strong>Motif :</strong> ${input.reason}`].join("<br/>"),
      ctaLabel: "Ouvrir l'admin", ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/refunds`,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, id: refundRef.id });
  } catch (err) {
    console.error("POST /api/refunds:", err);
    const message = err instanceof Error ? err.message : "";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
