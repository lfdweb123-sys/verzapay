import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";
import { parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  uid: z.string().min(1).max(128),
  companyId: z.string().min(1).max(128),
  amount: z.coerce.number().finite().positive(),
  currency: z.string().length(3).optional(),
  description: z.string().max(200).optional().nullable(),
  customerName: z.string().max(100).optional().nullable(),
  customerPhone: z.string().min(6).max(30),
});

// Crée un paiement avec le MÊME mécanisme que le système actuel (route existante appelée en interne,
// avec les droits de l'utilisateur) puis une session de checkout hébergé associée à un jeton opaque.
export async function POST(req: NextRequest) {
  try {
    const body = parseOrThrow(schema, await req.json());
    if (!(await verifyRequestUid(body.uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const limited = await checkRateLimit(`checkout-create:${body.uid}`, 20, 3600);
    if (!limited.allowed) return NextResponse.json({ error: "Trop de créations. Réessayez plus tard." }, { status: 429 });

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(body.companyId).get();
    const company = companySnap.data();
    if (!companySnap.exists || !Array.isArray(company?.members) || !company.members.includes(body.uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // La route de paiement principale crée désormais elle-même la page hébergée (avec repli JoonaPay).
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const res = await fetch(`${origin}/api/payments-engine/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("authorization") ?? "",
        ...(req.headers.get("x-vpz-internal") ? { "x-vpz-internal": req.headers.get("x-vpz-internal")!, "x-vpz-internal-uid": req.headers.get("x-vpz-internal-uid") ?? "" } : {}),
      },
      body: JSON.stringify({
        uid: body.uid, companyId: body.companyId, amount: body.amount, currency: body.currency,
        description: body.description ?? undefined, customerName: body.customerName ?? undefined,
        customerPhone: body.customerPhone, channel: "ANY",
      }),
    });
    const created = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: created.error ?? "Création du paiement impossible" }, { status: res.status });
    return NextResponse.json({ url: created.checkoutUrl, hosted: created.fallbackUrl !== null && created.fallbackUrl !== undefined });
  } catch (err) {
    console.error("POST /api/checkout/create:", err);
    const message = err instanceof Error ? err.message : "";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
