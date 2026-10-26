import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const disputeId = req.nextUrl.searchParams.get("disputeId");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const db = adminDb();
    if (disputeId) {
      const ref = db.collection("disputes").doc(disputeId);
      const d = await ref.get();
      if (!d.exists) return NextResponse.json({ error: "Litige introuvable" }, { status: 404 });
      const msgs = await ref.collection("messages").limit(200).get();
      return NextResponse.json({ dispute: d.data(), messages: msgs.docs.map((m) => m.data()).sort((a, b) => a.createdAt - b.createdAt) });
    }
    const snap = await db.collection("disputes").limit(500).get();
    return NextResponse.json({ disputes: snap.docs.map((d) => d.data()).sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch (err) {
    console.error("GET /api/admin/disputes:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
