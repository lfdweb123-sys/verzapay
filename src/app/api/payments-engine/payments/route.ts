import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayment, getJoonapayMisc } from "@/lib/joonapay";
import { sendPushAndStore } from "@/lib/push";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { createPaymentSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Transaction } from "@/types";

const LOG_PREFIX = "[CreatePayment]";

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
  console.log(`${LOG_PREFIX} [resolveCountry] customerPhone="${customerPhone}" companyCountryCode="${companyCountryCode}"`);
  console.log(`${LOG_PREFIX} [resolveCountry] Pays reçus de /misc (total=${countries.length}):`,
    countries.map((c) => `${c.code}(indicator=${c.indicator}, enabled=${c.payment_enabled})`));

  const active = countries.filter((c) => c.payment_enabled);
  console.log(`${LOG_PREFIX} [resolveCountry] Pays actifs (payment_enabled=true, total=${active.length}):`,
    active.map((c) => `${c.code}(${c.indicator})`));

  if (customerPhone) {
    const phone = customerPhone.startsWith("+") ? customerPhone : `+${customerPhone}`;
    console.log(`${LOG_PREFIX} [resolveCountry] Numéro normalisé="${phone}"`);

    const candidates = active
      .filter((c) => phone.startsWith(c.indicator))
      .sort((a, b) => b.indicator.length - a.indicator.length);

    console.log(`${LOG_PREFIX} [resolveCountry] Candidats matchant l'indicatif (total=${candidates.length}):`,
      candidates.map((c) => `${c.code}(${c.indicator})`));

    if (candidates.length > 0) {
      console.log(`${LOG_PREFIX} [resolveCountry] -> Match par numéro client: ${candidates[0].code}`);
      return candidates[0];
    }

    console.warn(`${LOG_PREFIX} [resolveCountry] Aucun pays actif ne matche l'indicatif de "${phone}" -> probablement un numéro hors zone couverte par JoonaPay (ex: +33 France, +1 USA, etc. si JoonaPay ne couvre que l'Afrique de l'Ouest)`);
  } else {
    console.log(`${LOG_PREFIX} [resolveCountry] Aucun customerPhone fourni -> tentative via companyCountryCode`);
  }

  if (companyCountryCode) {
    const byCompany = active.find((c) => c.code === companyCountryCode);
    console.log(`${LOG_PREFIX} [resolveCountry] Recherche par companyCountryCode="${companyCountryCode}" -> trouvé=${!!byCompany}`);
    if (byCompany) {
      console.log(`${LOG_PREFIX} [resolveCountry] -> Match par pays de l'entreprise: ${byCompany.code}`);
      return byCompany;
    }
  } else {
    console.warn(`${LOG_PREFIX} [resolveCountry] companyCountryCode non défini sur l'entreprise`);
  }

  console.error(`${LOG_PREFIX} [resolveCountry] -> ÉCHEC total: ni le numéro client ni le pays de l'entreprise ne matchent un pays actif côté JoonaPay`);
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
  console.log(`${LOG_PREFIX} [resolvePaymentMethod] countryUuid="${countryUuid}" channel="${channel}"`);

  const countryMethods = methods.filter(
    (m) => m.country.uuid === countryUuid && m.payment_status === "active"
  );
  console.log(`${LOG_PREFIX} [resolvePaymentMethod] Méthodes actives pour ce pays (total=${countryMethods.length}):`,
    countryMethods.map((m) => `${m.channel}(${m.name})`));

  const found = countryMethods.find((m) => m.channel === channel) ?? null;
  console.log(`${LOG_PREFIX} [resolvePaymentMethod] -> Résultat: ${found ? found.name : "AUCUNE MÉTHODE TROUVÉE"}`);
  return found;
}

/**
 * Envoie le lien de paiement par email au client si une adresse a été fournie.
 * Non bloquant : une erreur d'envoi ne doit jamais faire échouer la création
 * du paiement (même logique que la notification push ci-dessous).
 */
async function sendPaymentLinkEmail(opts: {
  customerEmail: string;
  customerName: string;
  amount: number;
  currency: string;
  description: string;
  checkoutUrl: string;
}): Promise<void> {
  const formattedAmount = `${opts.amount.toLocaleString("fr-FR")} ${opts.currency}`;
  const html = emailTemplate({
    title: "Vous avez un nouveau lien de paiement",
    body: `Bonjour ${opts.customerName},<br/><br/>Vous avez reçu une demande de paiement de <strong>${formattedAmount}</strong> pour : ${opts.description}.<br/><br/>Cliquez sur le bouton ci-dessous pour effectuer le paiement en toute sécurité.`,
    ctaLabel: "Payer maintenant",
    ctaUrl: opts.checkoutUrl,
  });

  await sendTransactionalEmail({
    to: [{ email: opts.customerEmail, name: opts.customerName }],
    subject: `Lien de paiement — ${formattedAmount}`,
    htmlContent: html,
  });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  console.log(`${LOG_PREFIX} ===> Requête reçue à ${new Date(startedAt).toISOString()}`);

  try {
    const raw = await req.json();
    console.log(`${LOG_PREFIX} Payload brut reçu:`, JSON.stringify(raw));

    const {
      companyId,
      amount,
      description,
      customerName,
      customerPhone,
      customerEmail,
      imageBase64,
      uid,
      feeBearer,
      // "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER" | "ANY" | undefined.
      // "ANY" (ou absent) = on ne fixe rien : JoonaPay affichera toutes les
      // méthodes actives pour ce pays sur sa page de paiement et le CLIENT
      // choisit lui-même. C'est la valeur par défaut recommandée.
      channel,
    } = parseOrThrow(createPaymentSchema, raw);

    console.log(`${LOG_PREFIX} Validation OK. companyId=${companyId} amount=${amount} customerPhone="${customerPhone}" customerEmail="${customerEmail}" channel="${channel}" uid=${uid}`);

    const limited = await checkRateLimit(`payment-create:uid:${uid}`, 60, 3600); // 60 liens / heure / utilisateur
    console.log(`${LOG_PREFIX} Rate limit check -> allowed=${limited.allowed}`);
    if (!limited.allowed) {
      console.warn(`${LOG_PREFIX} Rate limit dépassé pour uid=${uid}`);
      return NextResponse.json({ error: "Trop de liens créés récemment. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) {
      console.warn(`${LOG_PREFIX} Entreprise introuvable: companyId=${companyId}`);
      return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    }

    const company = companySnap.data()!;
    console.log(`${LOG_PREFIX} Entreprise trouvée: countryCode="${company.countryCode}" kycStatus="${company.kycStatus}" suspended=${company.suspended}`);

    // Sécurité : seul un membre réel de l'entreprise peut créer un paiement pour elle
    if (!Array.isArray(company.members) || !company.members.includes(uid)) {
      console.warn(`${LOG_PREFIX} Accès refusé: uid=${uid} n'est pas membre de companyId=${companyId}`);
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (company.kycStatus !== "approved") {
      console.warn(`${LOG_PREFIX} KYC non approuvé pour companyId=${companyId} (kycStatus=${company.kycStatus})`);
      return NextResponse.json({ error: "KYC non approuvé pour cette entreprise" }, { status: 403 });
    }
    if (company.suspended === true) {
      console.warn(`${LOG_PREFIX} Entreprise suspendue: companyId=${companyId}`);
      return NextResponse.json({ error: "Cette entreprise est actuellement suspendue. Contactez le support." }, { status: 403 });
    }

    // Un seul appel /misc nous donne à la fois les pays ET les méthodes de paiement
    // disponibles. On ne passe pas de filtre `channel` ici (cf note CARD vs
    // CREDIT_CARD) : on récupère tout ce qui est payment_enabled, et on filtre
    // nous-mêmes avec les vraies valeurs d'enum de la réponse.
    console.log(`${LOG_PREFIX} Appel JoonaPay GET /misc?payment_enabled=true`);
    const miscRes = await getJoonapayMisc({ payment_enabled: true });
    const countries: JoonapayCountryLike[] = miscRes.data?.countries ?? [];
    const paymentMethods: JoonapayPaymentMethodLike[] = miscRes.data?.payment_methods ?? [];

    console.log(`${LOG_PREFIX} Réponse /misc -> ${countries.length} pays, ${paymentMethods.length} méthodes de paiement`);
    console.log(`${LOG_PREFIX} Liste complète des pays renvoyés par JoonaPay:`, JSON.stringify(countries));

    // Résolution du country_uuid requis par JoonaPay — supporte tous les marchés actifs,
    // déduit en priorité depuis l'indicatif du numéro client.
    const country = resolveCountry(countries, customerPhone, company.countryCode);

    if (!country) {
      console.error(`${LOG_PREFIX} ❌ ÉCHEC résolution pays. customerPhone="${customerPhone}" companyCountryCode="${company.countryCode}". ` +
        `Cause probable: JoonaPay ne couvre que l'Afrique de l'Ouest -> aucun indicatif comme +33 (France), +1 (USA/Canada), ou autres pays européens ` +
        `ne matchera jamais un pays dans la liste /misc ci-dessus, ce qui explique pourquoi seuls les numéros africains passent.`);
      return NextResponse.json(
        {
          error:
            "Impossible de déterminer le pays pour ce paiement. Renseignez un numéro client valide (format international, ex: +22961000000) ou configurez le pays de l'entreprise.",
        },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} Pays résolu: ${country.code} (uuid=${country.uuid}, currency=${country.currency})`);

    const wantsSpecificChannel = !!channel && channel !== "ANY";
    console.log(`${LOG_PREFIX} wantsSpecificChannel=${wantsSpecificChannel} (channel demandé="${channel}")`);

    // Méthodes réellement actives pour ce pays, tous channels confondus —
    // utile à la fois pour le message d'erreur et pour le label affiché au marchand.
    const countryMethods = paymentMethods.filter(
      (m) => m.country.uuid === country.uuid && m.payment_status === "active"
    );
    console.log(`${LOG_PREFIX} Méthodes actives pour ${country.code} (total=${countryMethods.length}):`,
      countryMethods.map((m) => m.channel));

    let paymentMethod: JoonapayPaymentMethodLike | null = null;

    if (wantsSpecificChannel) {
      paymentMethod = resolvePaymentMethod(paymentMethods, country.uuid, channel as "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER");

      if (!paymentMethod) {
        const availableChannels = countryMethods
          .map((m) => m.channel)
          .filter((v, i, a) => a.indexOf(v) === i); // dédoublonne

        console.warn(`${LOG_PREFIX} Channel "${channel}" non disponible pour ${country.code}. Channels disponibles: [${availableChannels.join(", ")}]`);

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
      console.warn(`${LOG_PREFIX} Aucune méthode active pour ${country.code} (mode ANY) -> blocage avant appel JoonaPay`);
      return NextResponse.json(
        { error: `Aucune méthode de paiement active pour ${country.code}. Contactez le support JoonaPay.` },
        { status: 400 }
      );
    }
    // Sinon (mode "ANY") : paymentMethod reste null, on n'envoie pas
    // payment_method_uuid à JoonaPay, et leur page de checkout affichera
    // toutes les méthodes actives pour laisser le client choisir.

    console.log(`${LOG_PREFIX} paymentMethod résolu:`, paymentMethod ? `${paymentMethod.channel}(${paymentMethod.name})` : "null (mode ANY)");

    const dueDate = computeDueDate(DEFAULT_DUE_DAYS);

    // customer_name est OBLIGATOIRE côté JoonaPay quand customer_uuid n'est pas fourni
    // (Mode 2 — voir doc "Créer un paiement"). On met un fallback pour ne jamais
    // envoyer undefined et déclencher une 422.
    const resolvedCustomerName = customerName?.trim() || "Client Verzapay";

    // Enregistrement en DB (généré avant l'appel JoonaPay pour servir de merchant_transaction_id)
    const txRef = db.collection("companies").doc(companyId).collection("transactions").doc();
    console.log(`${LOG_PREFIX} txRef.id généré: ${txRef.id}`);

    const joonaPayload = {
      amount,
      currency: country.currency,
      country_uuid: country.uuid,
      ...(paymentMethod ? { payment_method_uuid: paymentMethod.uuid } : {}),
      due_date: dueDate,
      description: description ?? "Paiement Verzapay",
      customer_name: resolvedCustomerName,
      customer_phone: customerPhone ?? undefined,
      customer_email: customerEmail ?? undefined,
      // Frais à charge : choix ponctuel sinon réglage de l'entreprise (Paramètres > Frais)
      fee_bearer: (feeBearer ?? company.feesCollection ?? "MERCHANT") as "MERCHANT" | "CUSTOMER",
      merchant_transaction_id: txRef.id,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/joonapay`,
    };
    console.log(`${LOG_PREFIX} Payload envoyé à JoonaPay createPayment:`, JSON.stringify(joonaPayload));

    // Appel au partenaire de paiement
    // NOTE: pas de `return_url` — ce champ n'existe pas dans CreatePaymentRequest
    // côté JoonaPay (vérifié contre le schéma officiel). Le retour client après
    // paiement se gère via webhook_url + le payment_link affiché/partagé.
    const joonaRes = await createJoonapayPayment(joonaPayload);

    console.log(`${LOG_PREFIX} Réponse JoonaPay createPayment:`, JSON.stringify(joonaRes));

    if (!joonaRes.success) {
      console.error(`${LOG_PREFIX} ❌ JoonaPay a renvoyé success=false`, joonaRes);
      return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 502 });
    }

    const commission = Math.round(amount * (company.commissionRate ?? 0.005));
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
    console.log(`${LOG_PREFIX} Transaction Firestore créée: ${txRef.id} (joonapayPaymentId=${tx.joonapayPaymentId})`);

    // Mémorisation du client pour le sélectionner rapidement lors des
    // prochaines créations de lien — non bloquant.
    try {
      const clientId = String(customerPhone).replace(/\D/g, "");
      if (clientId) {
        await db.collection("companies").doc(companyId).collection("clients").doc(clientId).set(
          {
            name: customerName?.trim() || "",
            phone: customerPhone,
            email: customerEmail ?? "",
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
    } catch (clientErr) {
      console.error(`${LOG_PREFIX} Erreur enregistrement client (non bloquant):`, clientErr);
    }

    const checkoutUrl = joonaRes.data?.payment_link ?? "#";

    // Notification push
    try {
      await sendPushAndStore({
        uid,
        companyId,
        title: "Lien de paiement créé",
        body: paymentMethod
          ? `Un lien de ${amount.toLocaleString()} ${country.currency} via ${paymentMethod.name} a été créé.`
          : `Un lien de ${amount.toLocaleString()} ${country.currency} a été créé (toutes méthodes disponibles).`,
        type: "payment",
      });
      console.log(`${LOG_PREFIX} Push envoyée à uid=${uid}`);
    } catch (pushErr) {
      console.error(`${LOG_PREFIX} Erreur envoi push (non bloquant):`, pushErr);
    }

    // Email du lien de paiement au client — non bloquant, uniquement si une
    // adresse a été fournie par le marchand.
    if (customerEmail) {
      try {
        await sendPaymentLinkEmail({
          customerEmail,
          customerName: resolvedCustomerName,
          amount,
          currency: country.currency,
          description: description ?? "Paiement Verzapay",
          checkoutUrl,
        });
        console.log(`${LOG_PREFIX} Email du lien de paiement envoyé à "${customerEmail}"`);
      } catch (emailErr) {
        console.error(`${LOG_PREFIX} Erreur envoi email client (non bloquant):`, emailErr);
      }
    }

    console.log(`${LOG_PREFIX} ✅ Succès en ${Date.now() - startedAt}ms -> checkoutUrl=${checkoutUrl}`);

    return NextResponse.json({
      paymentId: txRef.id,
      joonapayId: joonaRes.data?.uuid,
      checkoutUrl,
      paymentMethodName: paymentMethod?.name ?? "Toutes les méthodes",
      channel: paymentMethod?.channel ?? "ANY",
      emailSent: !!customerEmail,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} ❌ Erreur non gérée:`, err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    if (isValidationError) {
      console.warn(`${LOG_PREFIX} Erreur de validation Zod/schema: ${message}`);
    }
    return NextResponse.json(
      {
        error: isValidationError ? message : "Une erreur est survenue lors de la création du paiement",
      },
      { status: isValidationError ? 400 : 500 }
    );
  } finally {
    console.log(`${LOG_PREFIX} <=== Fin de traitement (durée totale: ${Date.now() - startedAt}ms)`);
  }
}