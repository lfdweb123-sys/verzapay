import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { parseOrThrow } from "@/lib/validation";
import { hardDeleteUser, setUserDisabled } from "@/lib/user-admin";
import { adminDb } from "@/lib/firebase-admin";

const schema = z.object({
  adminUid: z.string().min(1),
  targetUids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["disable", "enable", "delete"]),
  reason: z.string().max(500).optional().nullable(),
});

// Action en masse sur des comptes : désactivation, réactivation ou suppression
// définitive. Aucun email n'est envoyé (nombreuses adresses fictives).
// Les comptes protégés (admin, soi-même, solde > 0, KYC approuvé) sont ignorés.
export async function POST(req: NextRequest) {
  try {
    const { adminUid, targetUids, action, reason } = parseOrThrow(schema, await req.json());
    if (!(await requireAdmin(adminUid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const db = adminDb();
    const done: string[] = [];
    const skipped: { uid: string; reason: string }[] = [];

    for (const uid of Array.from(new Set(targetUids))) {
      try {
        if (uid === adminUid) { skipped.push({ uid, reason: "votre propre compte" }); continue; }

        if (action === "delete") {
          const res = await hardDeleteUser(uid);
          if (res.deleted) done.push(uid); else skipped.push({ uid, reason: res.reason });
          continue;
        }

        const snap = await db.collection("users").doc(uid).get();
        if (!snap.exists) { skipped.push({ uid, reason: "introuvable" }); continue; }
        if (action === "disable" && snap.data()?.isAdmin) { skipped.push({ uid, reason: "compte administrateur" }); continue; }

        await setUserDisabled(uid, action === "disable", reason);
        done.push(uid);
      } catch (err) {
        console.error(`bulk-users ${action} ${uid}:`, err);
        skipped.push({ uid, reason: "erreur" });
      }
    }

    return NextResponse.json({ ok: true, done: done.length, doneUids: done, skipped });
  } catch (err) {
    console.error("POST /api/admin/bulk-users:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
