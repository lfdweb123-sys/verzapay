import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { authenticateApiRequest, ApiAuthError } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { publicAmounts } from "@/lib/charge";

// GET /api/v1/payments/{id} — statut d'un paiement. Sert à CONTRE-VÉRIFIER une notification webhook (voir /docs#webhooks).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company } = await authenticateApiRequest(req);
    const limited = await checkRateLimit(`api-v1-payment-get:company:${company.id}`, 600, 3600);
    if (!limited.allowed) return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });

    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });

    // Le paiement est lu DANS la collection de l'entreprise authentifiée : impossible de lire celui d'un autre marchand.
    const snap = await adminDb().collection("companies").doc(company.id).collection("transactions").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });
    const tx = snap.data()!;
    const { amount, currency } = publicAmounts(tx);

    return NextResponse.json({
      id: snap.id,
      status: tx.status, // pending | completed | failed
      amount,
      currency,
      charged_amount: tx.chargeAmount ?? null,
      charged_currency: tx.chargeCurrency ?? null,
      exchange_rate: tx.fxRate ?? null,
      description: tx.description ?? null,
      merchant_reference: tx.merchantReference ?? null,
      created_at: tx.createdAt ?? null,
      completed_at: tx.completedAt ?? null,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("GET /api/v1/payments/[id]:", err);
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
