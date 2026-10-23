import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { teamRespondSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyRequestUid } from "@/lib/auth-token";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { companyId, inviteId, token, uid, action } = parseOrThrow(teamRespondSchema, raw);
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }


    const limited = await checkRateLimit(`team-respond:uid:${uid}`, 30, 3600);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const inviteRef = db.collection("companies").doc(companyId).collection("invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });

    const invite = inviteSnap.data()!;
    if (invite.token !== token) return NextResponse.json({ error: "Lien d'invitation invalide" }, { status: 403 });
    if (invite.status !== "pending") return NextResponse.json({ error: "Cette invitation a déjà été traitée" }, { status: 409 });

    const userSnap = await db.collection("users").doc(uid).get();
    const userEmail = (userSnap.data()?.email ?? "").toLowerCase();
    if (userEmail !== invite.email) {
      return NextResponse.json({ error: "Cette invitation a été envoyée à une autre adresse email" }, { status: 403 });
    }

    if (action === "accept") {
      await db.collection("companies").doc(companyId).update({
        members: FieldValue.arrayUnion(uid),
      });
      await inviteRef.update({ status: "accepted" });
      return NextResponse.json({ ok: true, status: "accepted" });
    } else {
      await inviteRef.update({ status: "revoked" });
      return NextResponse.json({ ok: true, status: "revoked" });
    }
  } catch (err) {
    console.error("POST /api/team/respond:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
