import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";
import { getMemberCompany } from "@/lib/company-access";
import { parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyAdmin } from "@/lib/notify-admin";

// Litiges d'une entreprise : ouverture sur une transaction, échanges avec l'équipe Verzapay.

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const companyId = req.nextUrl.searchParams.get("companyId");
    const disputeId = req.nextUrl.searchParams.get("disputeId");
    if (!(await verifyRequestUid(uid))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!uid || !companyId) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    if (!(await getMemberCompany(uid, companyId))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    if (disputeId) {
      const ref = db.collection("disputes").doc(disputeId);
      const d = await ref.get();
      if (!d.exists || d.data()?.companyId !== companyId) return NextResponse.json({ error: "Litige introuvable" }, { status: 404 });
      const msgs = await ref.collection("messages").limit(200).get();
      return NextResponse.json({ dispute: d.data(), messages: msgs.docs.map((m) => m.data()).sort((a, b) => a.createdAt - b.createdAt) });
    }

    const snap = await db.collection("disputes").where("companyId", "==", companyId).limit(200).get();
    const txSnap = await db.collection("companies").doc(companyId).collection("transactions").limit(200).get();
    return NextResponse.json({
      disputes: snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt),
      transactions: txSnap.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt).map((t) => ({ id: t.id, createdAt: t.createdAt, customerName: t.customerName ?? "", amount: Number(t.amount), status: t.status })),
    });
  } catch (err) {
    console.error("GET /api/disputes:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"), uid: z.string().min(1).max(128), companyId: z.string().min(1).max(128),
    txId: z.string().min(1).max(128), type: z.enum(["not_received", "duplicate", "wrong_amount", "fraud", "other"]),
    description: z.string().min(10).max(2000),
  }),
  z.object({
    action: z.literal("message"), uid: z.string().min(1).max(128), companyId: z.string().min(1).max(128),
    disputeId: z.string().min(1).max(128), text: z.string().min(1).max(2000),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const input = parseOrThrow(schema, await req.json());
    if (!(await verifyRequestUid(input.uid))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const limited = await checkRateLimit(`dispute:${input.uid}`, 30, 3600);
    if (!limited.allowed) return NextResponse.json({ error: "Trop d'actions. Réessayez plus tard." }, { status: 429 });
    const access = await getMemberCompany(input.uid, input.companyId);
    if (!access) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const db = adminDb();
    const user = (await db.collection("users").doc(input.uid).get()).data();
    const authorName = String(user?.displayName ?? "Marchand");

    if (input.action === "create") {
      const tx = (await access.ref.collection("transactions").doc(input.txId).get()).data();
      if (!tx) return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
      const ref = db.collection("disputes").doc();
      await ref.set({
        id: ref.id, companyId: input.companyId, companyName: access.data.name ?? "", txId: input.txId,
        amount: Number(tx.amount), type: input.type, description: input.description,
        status: "open", openedBy: input.uid, createdAt: Date.now(), updatedAt: Date.now(), resolution: null,
      });
      await ref.collection("messages").add({ from: "merchant", authorName, text: input.description, createdAt: Date.now() });
      await notifyAdmin({
        title: `Nouveau litige — ${access.data.name}`,
        body: `<strong>Type :</strong> ${input.type}<br/><strong>Montant :</strong> ${Number(tx.amount).toLocaleString("fr-FR")} XOF<br/><br/>${input.description.replace(/[<>&]/g, "")}`,
        ctaLabel: "Ouvrir l'admin", ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/disputes`,
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, id: ref.id });
    }

    const ref = db.collection("disputes").doc(input.disputeId);
    const d = await ref.get();
    if (!d.exists || d.data()?.companyId !== input.companyId) return NextResponse.json({ error: "Litige introuvable" }, { status: 404 });
    if (["resolved", "rejected"].includes(d.data()!.status)) return NextResponse.json({ error: "Ce litige est clos" }, { status: 409 });
    await ref.collection("messages").add({ from: "merchant", authorName, text: input.text, createdAt: Date.now() });
    await ref.update({ updatedAt: Date.now(), status: "open" });
    await notifyAdmin({ title: `Nouveau message sur un litige — ${access.data.name}`, body: input.text.replace(/[<>&]/g, ""), ctaLabel: "Ouvrir l'admin", ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/disputes` }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/disputes:", err);
    const message = err instanceof Error ? err.message : "";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
