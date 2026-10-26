import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";
import { getMemberCompany, KYC_REQUIRED_MESSAGE } from "@/lib/company-access";
import { parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

// Facturation récurrente : un abonnement génère automatiquement un lien de paiement envoyé par email
// au client à chaque échéance (tâche planifiée /api/cron/recurring-billing).

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!(await verifyRequestUid(uid))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!uid || !companyId) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    if (!(await getMemberCompany(uid, companyId))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const snap = await adminDb().collection("subscriptions").where("companyId", "==", companyId).limit(200).get();
    return NextResponse.json({ subscriptions: snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt) });
  } catch (err) {
    console.error("GET /api/subscriptions:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"), uid: z.string().min(1).max(128), companyId: z.string().min(1).max(128),
    customerName: z.string().min(2).max(100), customerPhone: z.string().min(6).max(30), customerEmail: z.string().email().max(150),
    amount: z.coerce.number().finite().min(100), currency: z.enum(["XOF", "USD", "EUR"]).default("XOF"),
    interval: z.enum(["weekly", "monthly", "yearly"]), startAt: z.coerce.number().optional(),
    description: z.string().max(200).optional().nullable(),
  }),
  z.object({
    action: z.enum(["pause", "resume", "cancel"]), uid: z.string().min(1).max(128), companyId: z.string().min(1).max(128),
    subscriptionId: z.string().min(1).max(128),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const input = parseOrThrow(schema, await req.json());
    if (!(await verifyRequestUid(input.uid))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const limited = await checkRateLimit(`subs:${input.uid}`, 40, 3600);
    if (!limited.allowed) return NextResponse.json({ error: "Trop d'actions. Réessayez plus tard." }, { status: 429 });
    const access = await getMemberCompany(input.uid, input.companyId);
    if (!access) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (access.data.kycStatus !== "approved") return NextResponse.json({ error: KYC_REQUIRED_MESSAGE }, { status: 403 });

    const db = adminDb();
    if (input.action === "create") {
      const ref = db.collection("subscriptions").doc();
      const startAt = input.startAt && input.startAt > Date.now() ? input.startAt : Date.now();
      await ref.set({
        id: ref.id, companyId: input.companyId, createdBy: input.uid,
        customerName: input.customerName, customerPhone: input.customerPhone, customerEmail: input.customerEmail,
        amount: input.amount, currency: input.currency, interval: input.interval, description: input.description ?? "",
        status: "active", nextRunAt: startAt, runs: 0, failures: 0, lastRunAt: null, lastError: null, createdAt: Date.now(),
      });
      return NextResponse.json({ ok: true, id: ref.id });
    }

    const ref = db.collection("subscriptions").doc(input.subscriptionId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.companyId !== input.companyId) return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });
    if (snap.data()?.status === "cancelled") return NextResponse.json({ error: "Abonnement déjà annulé" }, { status: 409 });
    const patch = input.action === "pause" ? { status: "paused" } : input.action === "resume" ? { status: "active", failures: 0, lastError: null } : { status: "cancelled" };
    await ref.update(patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/subscriptions:", err);
    const message = err instanceof Error ? err.message : "";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
