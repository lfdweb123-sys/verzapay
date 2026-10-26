import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { parseOrThrow } from "@/lib/validation";
import { adminDb } from "@/lib/firebase-admin";

const schema = z.object({
  adminUid: z.string().min(1),
  companyId: z.string().min(1),
  payoutId: z.string().min(1),
  reconciled: z.boolean(),
  bankReference: z.string().max(100).optional().nullable(),
  bankAmount: z.coerce.number().finite().optional().nullable(),
  valueDate: z.string().max(10).optional().nullable(), // AAAA-MM-JJ
});

// Rapprochement bancaire d'un virement manuel : on enregistre la référence et le montant vus sur le
// relevé de la banque ; un écart avec le montant attendu est signalé.
export async function POST(req: NextRequest) {
  try {
    const i = parseOrThrow(schema, await req.json());
    if (!(await requireAdmin(i.adminUid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const ref = adminDb().collection("companies").doc(i.companyId).collection("payouts").doc(i.payoutId);
    const snap = await ref.get();
    const po = snap.data();
    if (!snap.exists || !po || po.method !== "bank_transfer" || po.manual !== true) return NextResponse.json({ error: "Virement manuel introuvable" }, { status: 404 });
    if (po.status !== "completed") return NextResponse.json({ error: "Seul un virement marqué « payé » peut être rapproché" }, { status: 400 });

    if (!i.reconciled) {
      await ref.update({ reconciled: false, reconciledAt: null, reconciledBy: null, bankReference: null, bankAmount: null, bankValueDate: null, reconcileGap: null });
      return NextResponse.json({ ok: true });
    }
    if (!i.bankReference?.trim()) return NextResponse.json({ error: "La référence bancaire est requise" }, { status: 400 });
    const bankAmount = i.bankAmount ?? Number(po.amount);
    await ref.update({
      reconciled: true, reconciledAt: Date.now(), reconciledBy: i.adminUid,
      bankReference: i.bankReference.trim(), bankAmount, bankValueDate: i.valueDate ?? null,
      reconcileGap: Math.round((bankAmount - Number(po.amount)) * 100) / 100,
    });
    return NextResponse.json({ ok: true, gap: Math.round((bankAmount - Number(po.amount)) * 100) / 100 });
  } catch (err) {
    console.error("POST /api/admin/payout-reconcile:", err);
    const m = err instanceof Error ? err.message : "";
    return NextResponse.json({ error: m.startsWith("Donnée invalide") ? m : "Une erreur est survenue" }, { status: m.startsWith("Donnée invalide") ? 400 : 500 });
  }
}
