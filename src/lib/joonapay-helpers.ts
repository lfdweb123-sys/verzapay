// lib/joonapay-helpers.ts
//
// Logique de résolution partagée entre les routes payments et payouts.
// Aucun pays ni opérateur codé en dur — tout est déduit dynamiquement de
// GET /api/v1/developer/misc pour supporter tous les marchés actifs.

import type { JoonapayCountry, JoonapayPaymentMethod, JoonapayEntity } from "@/lib/joonapay";
import { listJoonapayEntities, createJoonapayEntity, updateJoonapayEntity } from "@/lib/joonapay";

/**
 * Résout le pays JoonaPay à partir d'un numéro E.164 et/ou du pays de l'entreprise.
 *  1. Indicatif du numéro (le plus fiable car lié au réseau qui va encaisser/décaisser)
 *  2. company.countryCode en filet de sécurité
 *  3. null si rien ne matche — jamais de fallback silencieux vers un pays arbitraire
 */
export function resolveCountry(
  countries: JoonapayCountry[],
  phone: string | null | undefined,
  companyCountryCode: string | undefined,
  opts: { requireTransferEnabled?: boolean } = {}
): JoonapayCountry | null {
  const active = countries.filter((c) =>
    opts.requireTransferEnabled ? c.transfer_enabled : c.payment_enabled
  );

  if (phone) {
    const normalized = phone.startsWith("+") ? phone : `+${phone}`;
    const candidates = active
      .filter((c) => normalized.startsWith(c.indicator))
      .sort((a, b) => b.indicator.length - a.indicator.length);
    if (candidates.length > 0) return candidates[0];
  }

  if (companyCountryCode) {
    const byCompany = active.find((c) => c.code === companyCountryCode);
    if (byCompany) return byCompany;
  }

  return null;
}

export type PaymentMethodResolution =
  | { status: "resolved"; method: JoonapayPaymentMethod }
  | { status: "ambiguous"; options: JoonapayPaymentMethod[] }
  | { status: "none" };

/**
 * Résout l'opérateur mobile money (payment_method_uuid) pour un pays donné.
 * NE DEVINE PAS l'opérateur à partir du numéro : si plusieurs opérateurs actifs
 * existent pour ce pays, renvoie "ambiguous" avec la liste — à charge du front
 * de demander explicitement à l'utilisateur de choisir.
 */
export function resolvePaymentMethod(
  methods: JoonapayPaymentMethod[],
  countryCode: string,
  opts: { requireTransferEnabled?: boolean; explicitMethodCode?: string } = {}
): PaymentMethodResolution {
  const inCountry = methods.filter(
    (m) =>
      m.country.code === countryCode &&
      m.channel === "MOBILE_MONEY" &&
      (opts.requireTransferEnabled ? m.transfer_status === "active" : m.payment_status === "active")
  );

  if (opts.explicitMethodCode) {
    const match = inCountry.find((m) => m.code === opts.explicitMethodCode);
    return match ? { status: "resolved", method: match } : { status: "none" };
  }

  if (inCountry.length === 1) return { status: "resolved", method: inCountry[0] };
  if (inCountry.length > 1) return { status: "ambiguous", options: inCountry };
  return { status: "none" };
}

/**
 * Trouve une entité JoonaPay existante pour ce numéro, ou en crée une.
 *
 * On recherche par TÉLÉPHONE, pas par nom — le téléphone Mobile Money est
 * l'identifiant stable côté JoonaPay (le nom peut varier d'une demande à
 * l'autre : fautes de frappe, surnoms...).
 *
 * Si une entité existe déjà pour ce téléphone, on la réutilise telle quelle
 * (on ne met PAS à jour son nom à chaque payout, pour éviter d'écraser des
 * données potentiellement plus fiables côté JoonaPay).
 */
export async function findOrCreateEntity(params: {
  phone: string; // E.164
  name: string;
  countryCode: string;
  countryUuid: string;
  paymentMethodUuid: string;
}): Promise<JoonapayEntity> {
  const existing = await listJoonapayEntities({ phone: params.phone, per_page: 5 });
  const match = existing.data?.entities?.find((e) =>
    e.mobile_money_accounts?.some((acc) => acc.phone === params.phone)
  );
  if (match) return match;

  const created = await createJoonapayEntity({
    name: params.name,
    type: "VENDOR", // bénéficiaire d'un décaissement = fournisseur du point de vue du business
    phone: params.phone,
    country_code: params.countryCode,
    country_uuid: params.countryUuid,
    payment_method_uuid: params.paymentMethodUuid,
  });
  return created.data.entity;
}

/**
 * Résout la méthode "virement bancaire" (BANK_TRANSFER) active pour les
 * décaissements dans un pays donné.
 */
export function resolveBankTransferMethod(
  methods: JoonapayPaymentMethod[],
  countryCode: string
): JoonapayPaymentMethod | null {
  return (
    methods.find(
      (m) => m.country.code === countryCode && m.channel === "BANK_TRANSFER" && m.transfer_status === "active"
    ) ?? null
  );
}

export interface BankDetails {
  bankName: string;
  accountHolderName: string;
  iban?: string | null;
  bicSwift?: string | null;
  accountNumber?: string | null;
  sortCode?: string | null;
  routingNumber?: string | null;
}

/**
 * Trouve (par téléphone) ou crée le bénéficiaire, puis lui rattache le compte
 * bancaire fourni s'il n'existe pas déjà (même IBAN / même numéro de compte).
 */
export async function findOrCreateBankEntity(params: {
  phone: string;
  name: string;
  countryCode: string;
  countryUuid: string;
  paymentMethodUuid: string;
  bank: BankDetails;
}): Promise<JoonapayEntity> {
  const existing = await listJoonapayEntities({ phone: params.phone, per_page: 5 });
  let entity: JoonapayEntity | undefined = existing.data?.entities?.[0];

  if (!entity) {
    const created = await createJoonapayEntity({
      name: params.name,
      type: "VENDOR",
      phone: params.phone,
      country_code: params.countryCode,
      country_uuid: params.countryUuid,
      payment_method_uuid: params.paymentMethodUuid,
    });
    entity = created.data.entity;
  }

  const b = params.bank;
  const alreadyThere = entity.bank_accounts?.some(
    (acc) =>
      (b.iban && acc.iban === b.iban) ||
      (b.accountNumber && acc.account_number === b.accountNumber)
  );

  if (!alreadyThere) {
    const updated = await updateJoonapayEntity(entity.uuid, {
      bank_accounts: [
        {
          country_uuid: params.countryUuid,
          bank_name: b.bankName,
          account_holder_name: b.accountHolderName,
          iban: b.iban ?? undefined,
          bic_swift: b.bicSwift ?? undefined,
          account_number: b.accountNumber ?? undefined,
          sort_code: b.sortCode ?? undefined,
          routing_number: b.routingNumber ?? undefined,
          is_default: true,
        },
      ],
    });
    entity = updated.data.entity;
  }

  return entity;
}
