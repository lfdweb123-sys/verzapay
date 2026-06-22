import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const snap = await db.collection("users").where("pendingEmail", "!=", null).limit(100).get();
    const requests = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: data.displayName,
        currentEmail: data.email,
        pendingEmail: data.pendingEmail,
        requestedAt: data.pendingEmailRequestedAt,
      };
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error("GET /api/admin/email-requests:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
