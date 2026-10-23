import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";

// Liste des clients enregistrés d'une entreprise (créés automatiquement à
// chaque création de lien de paiement). Lecture côté serveur uniquement
// (Admin SDK) : une seule requête limitée, pas d'écoute temps réel.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const uid = req.nextUrl.searchParams.get("uid");
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (!companyId || !uid) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    const members = companySnap.data()?.members;
    if (!companySnap.exists || !Array.isArray(members) || !members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const snap = await db
      .collection("companies")
      .doc(companyId)
      .collection("clients")
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();

    const clients = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
      };
    });

    return NextResponse.json({ clients });
  } catch (err) {
    console.error("GET /api/clients:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
