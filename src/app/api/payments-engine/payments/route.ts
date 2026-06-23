import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayment, getJoonapayMisc } from "@/lib/joonapay";
import { sendPushAndStore } from "@/lib/push";
import { createPaymentSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Transaction } from "@/types";

// Délai par défaut avant expiration du lien de paiement (en jours)
const DEFAULT_DUE_DAYS = 7;

function computeDueDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

type JoonapayCountryLike = {
  uuid: string;
  code: string;
  indicator: string;
  currency: string;
  payment_enabled: boolean;
};

/**
 * Résout le pays JoonaPay à utiliser pour un paiement, sur TOUS les marchés actifs
 * (pas de pays codé en dur). Stratégie :
 *  1. Si un numéro client E.164 est fourni, on matche son indicatif (+229, +225, ...)
 *     avec le pays correspondant — c'est le numéro du client qui détermine quel
 *     réseau mobile money va encaisser, donc c'est la source la plus fiable.
 *  2. Sinon, on retombe sur company.countryCode (pays d'enregistrement du marchand).
 *  3. Si rien ne matche, erreur explicite — jamais de fallback silencieux vers un pays.
 */
function resolveCountry(
  countries: JoonapayCountryLike[],
  customerPhone: string | null | undefined,
  companyCountryCode: string | undefined
): JoonapayCountryLike | null {
  const active = countries.filter((c) => c.payment_enabled);

  if (customerPhone) {
    const phone = customerPhone.startsWith("+") ? customerPhone : `+${customerPhone}`;
    // On prend l'indicatif le plus long qui matche, pour éviter les collisions
    // entre indicatifs proches selon comment ils sont stockés.
    const candidates = active
      .filter((c) => phone.startsWith(c.indicator))
      .sort((a, b) => b.indicator.length - a.indicator.length);
    if (candidates.length > 0) return candidates[0];
  }

  if (companyCountryCode) {
    const byCompany = active.find((c) => c.code === companyCountryCode);
    if (byCompany) return byCompany;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { companyId, amount, description, customerName, customerPhone, customerEmail, imageBase64, uid } = parseOrThrow(createPaymentSchema, raw);

    const limited = await checkRateLimit(`payment-create:uid:${uid}`, 60, 3600); // 60 liens / heure / utilisateur
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de liens créés récemment. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    const company = companySnap.data()!;

    // Sécurité : seul un membre réel de l'entreprise peut créer un paiement pour elle
    if (!Array.isArray(company.members) || !company.members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (company.kycStatus !== "approved") {
      return NextResponse.json({ error: "KYC non approuvé pour cette entreprise" }, { status: 403 });
    }
    if (company.suspended === true) {
      return NextResponse.json({ error: "Cette entreprise est actuellement suspendue. Contactez le support." }, { status: 403 });
    }

    // Résolution du country_uuid requis par JoonaPay — supporte tous les marchés actifs,
    // déduit en priorité depuis l'indicatif du numéro client.
    const miscRes = await getJoonapayMisc({ payment_enabled: true });
    const country = resolveCountry(miscRes.data?.countries ?? [], customerPhone, company.countryCode);

    if (!country) {
      return NextResponse.json(
        {
          error:
            "Impossible de déterminer le pays pour ce paiement. Renseignez un numéro client valide (format international, ex: +22961000000) ou configurez le pays de l'entreprise.",
        },
        { status: 400 }
      );
    }

    const dueDate = computeDueDate(DEFAULT_DUE_DAYS);

    // customer_name est OBLIGATOIRE côté JoonaPay quand customer_uuid n'est pas fourni
    // (Mode 2 — voir doc "Créer un paiement"). On met un fallback pour ne jamais
    // envoyer undefined et déclencher une 422.
    const resolvedCustomerName = customerName?.trim() || "Client Verzapay";

    // Enregistrement en DB (généré avant l'appel JoonaPay pour servir de merchant_transaction_id)
    const txRef = db.collection("companies").doc(companyId).collection("transactions").doc();

    // Appel au partenaire de paiement
    // NOTE: pas de `return_url` — ce champ n'existe pas dans CreatePaymentRequest
    // côté JoonaPay (vérifié contre le schéma officiel). Le retour client après
    // paiement se gère via webhook_url + le payment_link affiché/partagé.
    const joonaRes = await createJoonapayPayment({
      amount,
      currency: country.currency,
      country_uuid: country.uuid,
      due_date: dueDate,
      description: description ?? "Paiement Verzapay",
      customer_name: resolvedCustomerName,
      customer_phone: customerPhone ?? undefined,
      customer_email: customerEmail ?? undefined,
      merchant_transaction_id: txRef.id,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/joonapay`,
    });

    if (!joonaRes.success) {
      return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 502 });
    }

    const commission = Math.round(amount * (company.commissionRate ?? 0.015));
    const netAmount = amount - commission;

    const tx: Transaction = {
      id: txRef.id,
      companyId,
      joonapayPaymentId: joonaRes.data?.uuid ?? null,
      amount,
      currency: country.currency,
      commission,
      netAmount,
      method: "mobile_money",
      status: "pending",
      description: description ?? undefined,
      imageBase64: imageBase64 ?? null,
      customerName: resolvedCustomerName,
      customerPhone: customerPhone ?? null,
      customerEmail: customerEmail ?? null,
      createdAt: Date.now(),
      completedAt: null,
    };
    await txRef.set(tx);

    // Notification push
    await sendPushAndStore({
      uid,
      companyId,
      title: "Lien de paiement créé",
      body: `Un lien de ${amount.toLocaleString()} ${country.currency} a été créé.`,
      type: "payment",
    });

    return NextResponse.json({
      paymentId: txRef.id,
      joonapayId: joonaRes.data?.uuid,
      checkoutUrl: joonaRes.data?.payment_link ?? "#",
    });
  } catch (err) {
    console.error("POST /api/joonapay/payments:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue lors de la création du paiement" }, { status: isValidationError ? 400 : 500 });
  }
}