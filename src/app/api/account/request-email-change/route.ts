import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { notifyAdmin } from "@/lib/notify-admin";
import { requestEmailChangeSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, newEmail } = parseOrThrow(requestEmailChangeSchema, raw);

    const limited = await checkRateLimit(`email-change-request:uid:${uid}`, 5, 86400); // 5 / jour
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const userData = userSnap.data()!;
    if (userData.email === newEmail) {
      return NextResponse.json({ error: "Cette adresse est déjà votre email actuel" }, { status: 400 });
    }

    const existing = await db.collection("users").where("email", "==", newEmail).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "Cette adresse email est déjà utilisée" }, { status: 409 });
    }

    await userRef.update({
      pendingEmail: newEmail,
      pendingEmailRequestedAt: Date.now(),
    });

    await notifyAdmin({
      title: "Demande de changement d'email",
      body: `<strong>${userData.displayName ?? userData.email}</strong> souhaite changer son email de <strong>${userData.email}</strong> vers <strong>${newEmail}</strong>. Cette modification nécessite votre validation.`,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/account/request-email-change:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
