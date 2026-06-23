import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import { parseOrThrow } from "@/lib/validation";

const schema = z.object({
  adminUid: z.string().min(1),
  email: z.string().email().optional(),
  targetUid: z.string().optional(),
  action: z.enum(["grant", "revoke"]),
});

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const snap = await db.collection("users").where("isAdmin", "==", true).get();
    const members = snap.docs.map((d) => ({
      uid: d.id,
      displayName: d.data().displayName ?? "Utilisateur",
      email: d.data().email ?? "—",
      photoURL: d.data().photoURL ?? null,
      isAdmin: true,
      createdAt: d.data().createdAt ?? 0,
    }));

    return NextResponse.json({ members });
  } catch (err) {
    console.error("GET /api/admin/team:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { adminUid, email, targetUid, action } = parseOrThrow(schema, raw);
    if (!(await requireAdmin(adminUid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();

    if (action === "grant") {
      if (!email) return NextResponse.json({ error: "Email requis" }, { status: 400 });
      // Trouver le compte par email
      const snap = await db.collection("users").where("email", "==", email.toLowerCase()).limit(1).get();
      if (snap.empty) return NextResponse.json({ error: "Aucun compte trouvé avec cet email. L'utilisateur doit d'abord créer un compte Verzapay." }, { status: 404 });
      const userDoc = snap.docs[0];
      if (userDoc.data().isAdmin) return NextResponse.json({ error: "Cet utilisateur est déjà administrateur" }, { status: 409 });
      await userDoc.ref.update({ isAdmin: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "revoke") {
      if (!targetUid) return NextResponse.json({ error: "targetUid requis" }, { status: 400 });
      if (targetUid === adminUid) return NextResponse.json({ error: "Vous ne pouvez pas révoquer vos propres droits" }, { status: 400 });
      await db.collection("users").doc(targetUid).update({ isAdmin: false });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/admin/team:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}