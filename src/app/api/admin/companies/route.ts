import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const isAdmin = await requireAdmin(uid);
    if (!isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const snap = await db.collection("companies").orderBy("createdAt", "desc").limit(200).get();
    const companies = snap.docs.map((d) => d.data());

    return NextResponse.json({ companies });
  } catch (err) {
    console.error("GET /api/admin/companies:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
