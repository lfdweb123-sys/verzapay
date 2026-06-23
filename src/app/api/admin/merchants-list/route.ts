import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const snap = await db.collection("users").limit(1000).get();
    const merchants = snap.docs.map((d) => ({
      uid: d.id,
      displayName: d.data().displayName ?? "Utilisateur",
      email: d.data().email ?? "—",
      photoURL: d.data().photoURL ?? null,
      createdAt: d.data().createdAt ?? 0,
      disabled: d.data().disabled ?? false,
    }));

    return NextResponse.json({ merchants });
  } catch (err) {
    console.error("GET /api/admin/merchants-list:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
