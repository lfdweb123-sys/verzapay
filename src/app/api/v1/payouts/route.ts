import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayout, createJoonapayEntity, getJoonapayMisc } from "@/lib/joonapay";
import { authenticateApiRequest, ApiAuthError } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseOrThrow } from "@/lib/validation";
import type { Payout } from "@/types";

const publicCreatePayoutSchema = z.object({
  amount: z.coerce.number().finite().min(500).max(50_000_000),
  currency: z.literal("XOF").optional(),
  recipient_phone: z.string().min(6).max(30),
  recipient_name: z.string().max(100).optional().nullable(),
  // Code opérateur explicite (ex: "MTN_CI") si le marchand le connaît déjà.
  // Optionnel : si absent, on tente de résoudre automatiquement via
  // l'indicatif téléphonique, et on échoue explicitement en cas d'ambiguïté
  // (plusieurs opérateurs mobile money actifs pour ce pays).
  recipient_operator: z.string().max(60).optional().nullable(),
  note: z.string().max(200).optional().nullable(),
  merchant_reference: z.string().max(128).optional().nullable(),
});

type JoonapayCountryLike = {
  uuid: string;
  code: string;
  indicator: string;
  currency: string;
  transfer_enabled: boolean;
};

type JoonapayPaymentMethodLike = {
  uuid: string;
  name: string;
  code: string;
  channel: "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER";
  transfer_status: "active" | "inactive";
  country: { uuid: string; code: string };
};

function resolveCountryForTransfer(
  countries: JoonapayCountryLike[],
  recipientPhone: string
): JoonapayCountryLike | null {
  const active = countries.filter((c) => c.transfer_enabled);
  const phone = recipientPhone.startsWith("+") ? recipientPhone : `+${recipientPhone}`;
  const candidates = active
    .filter((c) => phone.startsWith(c.indicator))
    .sort((a, b) => b.indicator.length - a.indicator.length);
  return candidates[0] ?? null;
}

/**
 * Résout l'opérateur mobile money à utiliser pour ce décaissement.
 *  - Si recipient_operator est fourni : on cherche une méthode active de ce
 *    code exact pour le pays résolu.
 *  - Sinon : s'il n'existe qu'UN seul opérateur mobile money actif en
 *    transfer_status pour ce pays, on le prend automatiquement. S'il y en a
 *    plusieurs, on refuse explicitement plutôt que de deviner lequel le
 *    bénéficiaire utilise réellement — un mauvais choix d'opérateur envoie
 *    l'argent à un compte qui n'existe pas chez ce bénéficiaire.
 */
function resolveTransferMethod(
  methods: JoonapayPaymentMethodLike[],
  countryUuid: string,
  recipientOperator: string | null | undefined
): { method: JoonapayPaymentMethodLike | null; ambiguous: boolean; candidates: JoonapayPaymentMethodLike[] } {
  const countryMethods = methods.filter(
    (m) =>
      m.country.uuid === countryUuid &&
      m.transfer_status === "active" &&
      m.channel === "MOBILE_MONEY"
  );

  if (recipientOperator) {
    const match = countryMethods.find((m) => m.code === recipientOperator) ?? null;
    return { method: match, ambiguous: false, candidates: countryMethods };
  }

  if (countryMethods.length === 1) {
    return { method: countryMethods[0], ambiguous: false, candidates: countryMethods };
  }

  return { method: null, ambiguous: countryMethods.length > 1, candidates: countryMethods };
}

export async function POST(req: NextRequest) {
  let companyIdForLog: string | undefined;
  try {
    const { company } = await authenticateApiRequest(req);
    companyIdForLog = company.id;

    const limited = await checkRateLimit(`api-v1-payout-create:company:${company.id}`, 60, 3600);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
    }

    if (company.suspended === true) {
      return NextResponse.json({ error: "Compte marchand suspendu." }, { status: 403 });
    }
    if (company.kycStatus !== "approved") {
      return NextResponse.json({ error: "KYC non approuvé." }, { status: 403 });
    }

    const raw = await req.json();
    const body = parseOrThrow(publicCreatePayoutSchema, raw);

    if ((company.walletBalance ?? 0) < body.amount) {
      return NextResponse.json({ error: "Solde insuffisant pour ce décaissement." }, { status: 400 });
    }

    const db = adminDb();

    const miscRes = await getJoonapayMisc({ transfer_enabled: true });
    const countries: JoonapayCountryLike[] = miscRes.data?.countries ?? [];
    const methods: JoonapayPaymentMethodLike[] = miscRes.data?.payment_methods ?? [];

    const country = resolveCountryForTransfer(countries, body.recipient_phone);
    if (!country) {
      return NextResponse.json(
        { error: "Impossible de déterminer le pays du bénéficiaire à partir de recipient_phone." },
        { status: 400 }
      );
    }

    const { method, ambiguous, candidates } = resolveTransferMethod(methods, country.uuid, body.recipient_operator);

    if (ambiguous) {
      return NextResponse.json(
        {
          error: "Plusieurs opérateurs mobile money sont disponibles pour ce pays. Précisez recipient_operator.",
          available_operators: candidates.map((c) => ({ code: c.code, name: c.name })),
        },
        { status: 400 }
      );
    }
    if (!method) {
      return NextResponse.json(
        { error: `Aucun opérateur de décaissement actif trouvé pour ${country.code}.` },
        { status: 400 }
      );
    }

    // Une entité bénéficiaire JoonaPay est requise pour créer un payout.
    // On en crée une nouvelle à chaque appel : simple et sans état à gérer
    // côté Verzapay pour l'API publique (le dashboard, lui, réutilise des
    // entités existantes — comportement distinct, pas de régression ici).
    const entityRes = await createJoonapayEntity({
      name: body.recipient_name?.trim() || "Bénéficiaire",
      type: "VENDOR",
      phone: body.recipient_phone,
      country_code: country.code,
      country_uuid: country.uuid,
      payment_method_uuid: method.uuid,
    });

    if (!entityRes.success || !entityRes.data?.entity?.uuid) {
      return NextResponse.json({ error: "Erreur lors de la préparation du bénéficiaire." }, { status: 502 });
    }

    const poRef = db.collection("companies").doc(company.id).collection("payouts").doc();

    const joonaRes = await createJoonapayPayout({
      country_uuid: country.uuid,
      merchant_transaction_id: poRef.id,
      description: body.note ?? "Décaissement",
      currency: country.currency,
      fee_bearer: company.feesPayout ?? "MERCHANT",
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/joonapay`,
      payouts: [
        {
          entity_uuid: entityRes.data.entity.uuid,
          amount: body.amount,
          phone: body.recipient_phone,
          payment_method_uuid: method.uuid,
          merchant_transaction_id: poRef.id,
          description: body.note ?? undefined,
        },
      ],
    });

    if (!joonaRes.success) {
      return NextResponse.json({ error: "Erreur lors de la création du décaissement" }, { status: 502 });
    }

    // Débit optimiste du solde — recrédité par le webhook en cas d'échec
    // (cf. /api/webhooks/joonapay, branche payout_group, déjà en place).
    await db.collection("companies").doc(company.id).update({
      walletBalance: (company.walletBalance ?? 0) - body.amount,
    });

    const payout: Payout = {
      id: poRef.id,
      companyId: company.id,
      joonapayPayoutId: joonaRes.data?.payout_group?.uuid ?? null,
      amount: body.amount,
      currency: country.currency,
      method: "mobile_money",
      recipientPhone: body.recipient_phone,
      recipientName: body.recipient_name ?? null,
      status: "pending",
      requestedBy: "api",
      createdAt: Date.now(),
      processedAt: null,
      note: body.note ?? null,
    };

    await poRef.set({
      ...payout,
      merchantReference: body.merchant_reference ?? null,
    });

    return NextResponse.json(
      {
        id: poRef.id,
        status: "pending",
        amount: body.amount,
        currency: country.currency,
        recipient_phone: body.recipient_phone,
        operator: method.name,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(`POST /api/v1/payouts [companyId=${companyIdForLog ?? "unknown"}]:`, err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json(
      { error: isValidationError ? message : "Une erreur est survenue lors de la création du décaissement" },
      { status: isValidationError ? 400 : 500 }
    );
  }
}