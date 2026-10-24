import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";
import { toMaskedBeneficiary, type StoredBeneficiary } from "@/lib/beneficiaries";

// Liste des bénéficiaires enregistrés d'une entreprise — valeurs MASQUÉES uniquement.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!companyId || !uid) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    const members = companySnap.data()?.members;
    if (!companySnap.exists || !Array.isArray(members) || !members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const snap = await db
      .collection("companies").doc(companyId).collection("beneficiaries")
      .orderBy("updatedAt", "desc").limit(100).get();

    return NextResponse.json({
      beneficiaries: snap.docs.map((d) => toMaskedBeneficiary(d.id, d.data() as StoredBeneficiary)),
    });
  } catch (err) {
    console.error("GET /api/beneficiaries:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
