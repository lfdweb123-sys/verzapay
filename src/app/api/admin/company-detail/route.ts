import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (!companyId) return NextResponse.json({ error: "companyId manquant" }, { status: 400 });

    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;

    const [membersData, recentTx, recentPayouts, ledgerEntries] = await Promise.all([
      Promise.all(
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
      ),
      companyRef.collection("transactions").orderBy("createdAt", "desc").limit(50).get(),
      companyRef.collection("payouts").orderBy("createdAt", "desc").limit(50).get(),
      companyRef.collection("ledger").orderBy("createdAt", "desc").limit(50).get(),
    ]);

    return NextResponse.json({
      company,
      members: membersData,
      transactions: recentTx.docs.map((d) => d.data()),
      payouts: recentPayouts.docs.map((d) => d.data()),
      ledger: ledgerEntries.docs.map((d) => d.data()),
    });
  } catch (err) {
    console.error("GET /api/admin/company-detail:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
