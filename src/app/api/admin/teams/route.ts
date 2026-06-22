import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const companiesSnap = await db.collection("companies").orderBy("createdAt", "desc").limit(200).get();

    const teams = await Promise.all(
      companiesSnap.docs.map(async (companyDoc) => {
        const company = companyDoc.data();
        const members = await Promise.all(
          (company.members ?? []).map(async (memberUid: string) => {
            const userSnap = await db.collection("users").doc(memberUid).get();
            const userData = userSnap.data();
            return {
              uid: memberUid,
              displayName: userData?.displayName ?? "Utilisateur",
              email: userData?.email ?? "—",
              photoURL: userData?.photoURL ?? null,
              isOwner: memberUid === company.ownerUid,
            };
          })
        );
        return { companyId: companyDoc.id, companyName: company.name, members };
      })
    );

    return NextResponse.json({ teams: teams.filter((t) => t.members.length > 0) });
  } catch (err) {
    console.error("GET /api/admin/teams:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
