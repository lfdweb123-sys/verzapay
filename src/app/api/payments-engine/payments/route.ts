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

// IMPORTANT : la réponse /misc utilise "CREDIT_CARD" (pas "CARD") dans
// payment_methods[].channel. "CARD" n'existe que comme valeur du paramètre
// de filtre de la REQUÊTE GET /misc?channel=CARD — ne pas confondre les deux.
type JoonapayPaymentMethodLike = {
  uuid: string;
  name: string;
  channel: "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER";
  payment_status: "active" | "inactive";
  country: {
    uuid: string;
    code: string;
  };
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

/**
 * Résout la méthode de paiement à utiliser pour le pays donné, UNIQUEMENT
 * quand un channel précis est demandé (channel !== "ANY"/undefined).
 * Si le channel demandé n'existe pas pour ce pays (compte JoonaPay pas encore
 * activé pour CREDIT_CARD/BANK_TRANSFER, ou pays non couvert), on retourne null
 * et l'appelant doit renvoyer une erreur explicite — jamais de fallback silencieux
 * vers une autre méthode que celle demandée.
 */
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

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const {
      companyId,
      amount,
      description,
      customerName,
      customerPhone,
      customerEmail,
      imageBase64,
      uid,
      // "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER" | "ANY" | undefined.
      // "ANY" (ou absent) = on ne fixe rien : JoonaPay affichera toutes les
      // méthodes actives pour ce pays sur sa page de paiement et le CLIENT
      // choisit lui-même. C'est la valeur par défaut recommandée.
      channel,
    } = parseOrThrow(createPaymentSchema, raw);

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

    // Un seul appel /misc nous donne à la fois les pays ET les méthodes de paiement
    // disponibles. On ne passe pas de filtre `channel` ici (cf note CARD vs
    // CREDIT_CARD) : on récupère tout ce qui est payment_enabled, et on filtre
    // nous-mêmes avec les vraies valeurs d'enum de la réponse.
    const miscRes = await getJoonapayMisc({ payment_enabled: true });
    const countries: JoonapayCountryLike[] = miscRes.data?.countries ?? [];
    const paymentMethods: JoonapayPaymentMethodLike[] = miscRes.data?.payment_methods ?? [];

    // Résolution du country_uuid requis par JoonaPay — supporte tous les marchés actifs,
    // déduit en priorité depuis l'indicatif du numéro client.
    const country = resolveCountry(countries, customerPhone, company.countryCode);

    if (!country) {
      return NextResponse.json(
        {
          error:
            "Impossible de déterminer le pays pour ce paiement. Renseignez un numéro client valide (format international, ex: +22961000000) ou configurez le pays de l'entreprise.",
        },
        { status: 400 }
      );
    }

    const wantsSpecificChannel = !!channel && channel !== "ANY";

    // Méthodes réellement actives pour ce pays, tous channels confondus —
    // utile à la fois pour le message d'erreur et pour le label affiché au marchand.
    const countryMethods = paymentMethods.filter(
      (m) => m.country.uuid === country.uuid && m.payment_status === "active"
    );

    let paymentMethod: JoonapayPaymentMethodLike | null = null;

    if (wantsSpecificChannel) {
      paymentMethod = resolvePaymentMethod(paymentMethods, country.uuid, channel as "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER");

      if (!paymentMethod) {
        const availableChannels = countryMethods
          .map((m) => m.channel)
          .filter((v, i, a) => a.indexOf(v) === i); // dédoublonne

        return NextResponse.json(
          {
            error: `Méthode de paiement "${channel}" non disponible pour ${country.code}. Méthodes disponibles : ${availableChannels.join(", ") || "aucune"}. Si CREDIT_CARD ou BANK_TRANSFER manquent, contactez le support JoonaPay pour activer ces canaux sur votre compte marchand.`,
            availableChannels,
          },
          { status: 400 }
        );
      }
    } else if (countryMethods.length === 0) {
      // Aucune méthode active du tout pour ce pays -> on bloque avant d'appeler JoonaPay
      return NextResponse.json(
        { error: `Aucune méthode de paiement active pour ${country.code}. Contactez le support JoonaPay.` },
        { status: 400 }
      );
    }
    // Sinon (mode "ANY") : paymentMethod reste null, on n'envoie pas
    // payment_method_uuid à JoonaPay, et leur page de checkout affichera
    // toutes les méthodes actives pour laisser le client choisir.

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
      // Envoyé UNIQUEMENT si un channel précis a été demandé. En mode "ANY",
      // ce champ est omis -> JoonaPay laisse le client choisir sa méthode.
      ...(paymentMethod ? { payment_method_uuid: paymentMethod.uuid } : {}),
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

    // Si le marchand a laissé le choix au client (mode "ANY"), on ne connaît
    // pas encore la méthode réelle au moment de la création : on enregistre
    // "mobile_money" comme valeur par défaut neutre, à corriger plus tard via
    // le webhook JoonaPay (qui renvoie la méthode effectivement utilisée).
    const txMethod: Transaction["method"] =
      paymentMethod?.channel === "CREDIT_CARD"
        ? "card"
        : paymentMethod?.channel === "BANK_TRANSFER"
        ? "bank_transfer"
        : "mobile_money";

    const tx: Transaction = {
      id: txRef.id,
      companyId,
      joonapayPaymentId: joonaRes.data?.uuid ?? null,
      amount,
      currency: country.currency,
      commission,
      netAmount,
      method: txMethod,
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
      body: paymentMethod
        ? `Un lien de ${amount.toLocaleString()} ${country.currency} via ${paymentMethod.name} a été créé.`
        : `Un lien de ${amount.toLocaleString()} ${country.currency} a été créé (toutes méthodes disponibles).`,
      type: "payment",
    });

    return NextResponse.json({
      paymentId: txRef.id,
      joonapayId: joonaRes.data?.uuid,
      checkoutUrl: joonaRes.data?.payment_link ?? "#",
      paymentMethodName: paymentMethod?.name ?? "Toutes les méthodes",
      channel: paymentMethod?.channel ?? "ANY",
    });
  } catch (err) {
    console.error("POST /api/payments-engine/payments:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json(
      {
        error: isValidationError ? message : "Une erreur est survenue lors de la création du paiement",
      },
      { status: isValidationError ? 400 : 500 }
    );
  }
}