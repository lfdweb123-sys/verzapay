import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ error: "UID administrateur requis" }, { status: 400 });
    }
    
    if (!(await requireAdmin(uid))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const db = adminDb();
    const snap = await db.collection("users").limit(1000).get();
    
    const merchants = snap.docs.map((d) => {
      const data = d.data();
      
      // Gestion sécurisée de createdAt
      let createdAt = data.createdAt;
      
      // Si createdAt est une chaîne, la convertir en nombre
      if (typeof createdAt === 'string') {
        createdAt = parseInt(createdAt, 10);
      }
      
      // Si createdAt n'est pas un nombre valide, utiliser la date actuelle
      if (!createdAt || typeof createdAt !== 'number' || isNaN(createdAt) || createdAt <= 0) {
        createdAt = Date.now();
      }
      
      return {
        uid: d.id,
        displayName: data.displayName ?? "Utilisateur",
        email: data.email ?? "—",
        photoURL: data.photoURL ?? null,
        createdAt: createdAt,
        disabled: data.disabled ?? false,
        suspended: data.suspended ?? false,
      };
    });

    // Trier par date de création (du plus récent au plus ancien)
    merchants.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ merchants });
  } catch (err) {
    console.error("GET /api/admin/merchants-list:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}