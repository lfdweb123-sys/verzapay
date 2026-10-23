import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { parseOrThrow } from "@/lib/validation";
import { adminDb } from "@/lib/firebase-admin";

const schema = z.object({
  adminUid: z.string().min(1),
  companyIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["suspend", "unsuspend", "delete"]),
  reason: z.string().max(500).optional().nullable(),
});

// Action en masse sur des entreprises : suspension, réactivation ou suppression
// définitive (avec toutes leurs données). Aucun email ni notification n'est envoyé.
// Une entreprise avec un solde positif n'est jamais supprimée.
export async function POST(req: NextRequest) {
  try {
    const { adminUid, companyIds, action, reason } = parseOrThrow(schema, await req.json());
    if (!(await requireAdmin(adminUid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const db = adminDb();
    let done = 0;
    const skipped: { id: string; reason: string }[] = [];

    for (const id of Array.from(new Set(companyIds))) {
      try {
        const ref = db.collection("companies").doc(id);
        const snap = await ref.get();
        if (!snap.exists) { skipped.push({ id, reason: "introuvable" }); continue; }

        if (action === "delete") {
          if (Number(snap.data()?.walletBalance ?? 0) > 0) { skipped.push({ id, reason: "solde positif" }); continue; }
          await db.recursiveDelete(ref);
          // Les utilisateurs qui l'avaient comme entreprise active ne pointent plus dans le vide
          const users = await db.collection("users").where("activeCompanyId", "==", id).get();
          if (!users.empty) {
            const batch = db.batch();
            users.docs.forEach((u) => batch.update(u.ref, { activeCompanyId: null }));
            await batch.commit();
          }
        } else if (action === "suspend") {
          await ref.update({ suspended: true, suspendedAt: Date.now(), suspendedReason: reason ?? null });
        } else {
          await ref.update({ suspended: false, suspendedAt: null, suspendedReason: null });
        }
        done++;
      } catch (err) {
        console.error(`bulk-companies ${action} ${id}:`, err);
        skipped.push({ id, reason: "erreur" });
      }
    }

    return NextResponse.json({ ok: true, done, skipped });
  } catch (err) {
    console.error("POST /api/admin/bulk-companies:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
