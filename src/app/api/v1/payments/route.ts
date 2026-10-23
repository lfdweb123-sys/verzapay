import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayment, getJoonapayMisc } from "@/lib/joonapay";
import { authenticateApiRequest, ApiAuthError } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseOrThrow } from "@/lib/validation";
import { planCharge, planFields } from "@/lib/charge";
import { FxError } from "@/lib/fx";
import type { Transaction } from "@/types";

const DEFAULT_DUE_DAYS = 7;

function computeDueDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Schéma du body PUBLIC (champs en snake_case, alignés sur la doc /docs),
// distinct du schéma interne createPaymentSchema utilisé par le dashboard.
const publicCreatePaymentSchema = z.object({
  // Montant dans `currency` (défaut XOF). Convertit automatiquement vers la devise du pays du client ;
  // les bornes (100 XOF min, 50 000 000 XOF max) s'appliquent à l'équivalent XOF.
  amount: z.coerce.number().finite().positive().max(1e12),
  currency: z.string().length(3).transform((c) => c.toUpperCase()).optional(),
  description: z.string().max(200).optional().nullable(),
  customer_name: z.string().max(100).optional().nullable(),
  customer_phone: z.string({ error: "customer_phone est requis" }).min(6, "customer_phone est requis").max(30),
  customer_email: z.string().email().max(150).optional().nullable(),
  // "any" (ou absent) = pas de méthode imposée, le client choisit sur la
  // page JoonaPay. Sinon verrouille un canal précis.
  channel: z.enum(["any", "mobile_money", "credit_card", "bank_transfer"]).optional().nullable(),
  merchant_reference: z.string().max(128).optional().nullable(),
  fee_bearer: z.enum(["merchant", "customer"]).optional().nullable(), // sinon réglage Paramètres > Frais
  webhook_url: z.string().url().optional().nullable(), // override ponctuel, sinon company.webhookUrl
});

type JoonapayCountryLike = {
  uuid: string;
  code: string;
  indicator: string;
  currency: string;
  payment_enabled: boolean;
};

type JoonapayPaymentMethodLike = {
  uuid: string;
  name: string;
  channel: "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER";
  payment_status: "active" | "inactive";
  country: { uuid: string; code: string };
};

function resolveCountry(
  countries: JoonapayCountryLike[],
  customerPhone: string | null | undefined,
  companyCountryCode: string | undefined
): JoonapayCountryLike | null {
  const active = countries.filter((c) => c.payment_enabled);

  if (customerPhone) {
    const phone = customerPhone.startsWith("+") ? customerPhone : `+${customerPhone}`;
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

function resolvePaymentMethod(
  methods: JoonapayPaymentMethodLike[],
  countryUuid: string,
  channel: "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER"
): JoonapayPaymentMethodLike | null {
  const countryMethods = methods.filter(
    (m) => m.country.uuid === countryUuid && m.payment_status === "active"
  );
  return countryMethods.find((m) => m.channel === channel) ?? null;
}

const CHANNEL_PUBLIC_TO_JOONAPAY: Record<string, "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER"> = {
  mobile_money: "MOBILE_MONEY",
  credit_card: "CREDIT_CARD",
  bank_transfer: "BANK_TRANSFER",
};

export async function POST(req: NextRequest) {
  let companyIdForLog: string | undefined;
  try {
    const { company } = await authenticateApiRequest(req);
    companyIdForLog = company.id;

    // Rate limit par entreprise (et non par uid, puisqu'il n'y a pas
    // d'utilisateur connecté ici — l'appelant est le serveur du marchand).
    const limited = await checkRateLimit(`api-v1-payment-create:company:${company.id}`, 120, 3600);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
    }

    if (company.suspended === true) {
      return NextResponse.json({ error: "Compte marchand suspendu." }, { status: 403 });
    }

    const raw = await req.json();
    const body = parseOrThrow(publicCreatePaymentSchema, raw);

    const db = adminDb();

    const miscRes = await getJoonapayMisc({ payment_enabled: true });
    const countries: JoonapayCountryLike[] = miscRes.data?.countries ?? [];
    const paymentMethods: JoonapayPaymentMethodLike[] = miscRes.data?.payment_methods ?? [];

    const country = resolveCountry(countries, body.customer_phone, company.country);
    if (!country) {
      return NextResponse.json(
        {
          error:
            "Impossible de déterminer le pays pour ce paiement. Fournissez customer_phone au format international (ex: +22961000000).",
        },
        { status: 400 }
      );
    }

    const wantsSpecificChannel = !!body.channel && body.channel !== "any";
    const countryMethods = paymentMethods.filter(
      (m) => m.country.uuid === country.uuid && m.payment_status === "active"
    );

    let paymentMethod: JoonapayPaymentMethodLike | null = null;

    if (wantsSpecificChannel) {
      const targetChannel = CHANNEL_PUBLIC_TO_JOONAPAY[body.channel as string];
      paymentMethod = resolvePaymentMethod(paymentMethods, country.uuid, targetChannel);

      if (!paymentMethod) {
        const availableChannels = countryMethods
          .map((m) => m.channel)
          .filter((v, i, a) => a.indexOf(v) === i);
        return NextResponse.json(
          {
            error: `Méthode de paiement "${body.channel}" non disponible pour ${country.code}.`,
            available_channels: availableChannels,
          },
          { status: 400 }
        );
      }
    } else if (countryMethods.length === 0) {
      return NextResponse.json(
        { error: `Aucune méthode de paiement active pour ${country.code}.` },
        { status: 400 }
      );
    }

    // Conversion : montant demandé (currency, défaut XOF) -> devise du pays du client (débit) et -> XOF (ledger).
    const plan = await planCharge({ amount: body.amount, currency: body.currency, targetCurrency: country.currency, minLedger: 100, maxLedger: 50_000_000 });

    const dueDate = computeDueDate(DEFAULT_DUE_DAYS);
    const resolvedCustomerName = body.customer_name?.trim() || "Client";

    const txRef = db
      .collection("companies")
      .doc(company.id)
      .collection("transactions")
      .doc();

    // webhook_url envoyé toujours vers Verzapay lui-même (jamais directement
    // vers le marchand) — c'est /api/webhooks/joonapay qui re-notifiera
    // ensuite company.webhookUrl pour CE marchand précis une fois l'événement
    // confirmé et signé. On ne fait jamais confiance à une URL tierce fournie
    // en body pour appeler JoonaPay directement.
    const joonaRes = await createJoonapayPayment({
      amount: plan.chargeAmount,
      currency: plan.chargeCurrency,
      country_uuid: country.uuid,
      ...(paymentMethod ? { payment_method_uuid: paymentMethod.uuid } : {}),
      due_date: dueDate,
      description: body.description ?? "Paiement",
      customer_name: resolvedCustomerName,
      customer_phone: body.customer_phone ?? undefined,
      customer_email: body.customer_email ?? undefined,
      fee_bearer: body.fee_bearer
        ? (body.fee_bearer.toUpperCase() as "MERCHANT" | "CUSTOMER")
        : (company.feesCollection ?? "MERCHANT"),
      merchant_transaction_id: txRef.id,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/joonapay`,
    });

    if (!joonaRes.success) {
      return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 502 });
    }

    // Ledger en XOF : commission et net calculés sur l'équivalent XOF.
    const commission = Math.round(plan.ledgerAmount * (company.commissionRate ?? 0.005));
    const netAmount = plan.ledgerAmount - commission;

    const txMethod: Transaction["method"] =
      paymentMethod?.channel === "CREDIT_CARD"
        ? "card"
        : paymentMethod?.channel === "BANK_TRANSFER"
        ? "bank_transfer"
        : "mobile_money";

    const tx: Transaction = {
      id: txRef.id,
      companyId: company.id,
      joonapayPaymentId: joonaRes.data?.uuid ?? null,
      amount: plan.ledgerAmount,
      currency: "XOF",
      ...planFields(plan),
      commission,
      netAmount,
      method: txMethod,
      status: "pending",
      description: body.description ?? undefined,
      imageBase64: null,
      customerName: resolvedCustomerName,
      customerPhone: body.customer_phone ?? null,
      customerEmail: body.customer_email ?? null,
      createdAt: Date.now(),
      completedAt: null,
    };

    // merchant_reference et webhook_url (override ponctuel) sont stockés sur
    // la transaction pour que /api/webhooks/joonapay puisse les relayer dans
    // le payload final envoyé au marchand sans avoir à les redemander.
    await txRef.set({
      ...tx,
      merchantReference: body.merchant_reference ?? null,
      webhookUrlOverride: body.webhook_url ?? null,
    });

    return NextResponse.json(
      {
        id: txRef.id,
        status: "pending",
        amount: plan.requestedAmount,
        currency: plan.requestedCurrency,
        charged_amount: plan.chargeAmount,
        charged_currency: plan.chargeCurrency,
        exchange_rate: plan.fxRate,
        checkout_url: joonaRes.data?.payment_link ?? null,
        payment_method: paymentMethod?.name ?? "any",
        channel: paymentMethod?.channel ?? "ANY",
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof FxError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(`POST /api/v1/payments [companyId=${companyIdForLog ?? "unknown"}]:`, err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json(
      { error: isValidationError ? message : "Une erreur est survenue lors de la création du paiement" },
      { status: isValidationError ? 400 : 500 }
    );
  }
}