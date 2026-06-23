// lib/joonapay.ts

const JOONAPAY_PROXY_URL = process.env.JOONAPAY_PROXY_URL;

function getProxyHeaders(): Record<string, string> {
  if (!JOONAPAY_PROXY_URL) {
    throw new Error("Variable d'environnement JOONAPAY_PROXY_URL manquante");
  }
  if (!process.env.PROXY_SECRET) {
    throw new Error("Variable d'environnement PROXY_SECRET manquante");
  }
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Proxy-Secret": process.env.PROXY_SECRET,
  };
}

// ─── Types communs ────────────────────────────────────────────────────────────

export interface JoonapayApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors: {
    code: string;
    details: Record<string, string[]> | null;
  } | null;
  metadata: {
    request_id: string;
    timestamp: string;
    version: string;
    response_time: string;
  };
}

export interface JoonapayPagination {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

// ─── Misc / Données de référence ─────────────────────────────────────────────

export interface JoonapayCountry {
  uuid: string;
  code: string;
  name: string;
  indicator: string;
  currency: string;
  payment_enabled: boolean;
  transfer_enabled: boolean;
}

export interface JoonapayPaymentMethod {
  uuid: string;
  name: string;
  channel: "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER";
  code: string;
  payment_status: "active" | "inactive";
  transfer_status: "active" | "inactive";
  country: {
    uuid: string;
    code: string;
    name: string;
    indicator: string;
  };
}

export interface JoonapayMiscData {
  countries: JoonapayCountry[];
  payment_methods: JoonapayPaymentMethod[];
}

export async function getJoonapayMisc(params?: {
  payment_enabled?: boolean;
  transfer_enabled?: boolean;
  country_code?: string;
  channel?: "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER";
}): Promise<JoonapayApiResponse<JoonapayMiscData>> {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : "";
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/misc${qs}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay misc error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export interface JoonapayBalance {
  country: string;
  country_code: string;
  currency: string;
  service: "PAYIN" | "PAYOUT";
  balance: number;
}

export async function getJoonapayBalance(): Promise<JoonapayApiResponse<JoonapayBalance[]>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/balance`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay balance error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Paiements ────────────────────────────────────────────────────────────────

export interface CreatePaymentParams {
  amount: number;                          // min 100 XOF
  country_uuid: string;                    // requis — obtenu via GET /misc
  due_date: string;                        // requis — format YYYY-MM-DD >= aujourd'hui
  currency?: string;                       // défaut: XOF
  description?: string;
  // Mode 1 : client existant
  customer_uuid?: string;
  // Mode 2 : sans client existant
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;                 // format E.164 ex: +22961000000
  // Options
  merchant_transaction_id?: string;
  notification_by?: ("EMAIL" | "SMS" | "WHATSAPP")[];
  allow_partial_payment?: boolean;
  fee_bearer?: "MERCHANT" | "CUSTOMER";
  webhook_url?: string;
  custom_message?: string;
}

export interface CreatePaymentResult {
  uuid: string;
  reference: string;
  amount: number;
  currency: string;
  status: "NEW" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";
  payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" | "REFUNDED";
  due_date: string;
  payment_link: string;
  webhook_url?: string;
}

export interface PaymentRequestSummary {
  uuid: string;
  reference: string;
  merchant_transaction_id?: string;
  amount: number;
  paid_amount: number;
  currency: string;
  status: "NEW" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";
  payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" | "REFUNDED";
  payment_link: string;
  due_date: string;
  paid_at?: string;
  created_at: string;
}

export interface PaymentAttempt {
  uuid: string;
  reference: string;
  amount: number;
  status: "PENDING" | "SUCCESS" | "FAILED";
  payment_method: string;
  phone?: string;
  completed_at?: string;
  failed_at?: string;
  failure_reason?: string;
}

export interface PaymentRequestDetail extends PaymentRequestSummary {
  customer: {
    uuid: string;
    name: string;
    email?: string;
    phone?: string;
  };
  payments: PaymentAttempt[];
}

export async function createJoonapayPayment(
  params: CreatePaymentParams
): Promise<JoonapayApiResponse<CreatePaymentResult>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payments`, {
    method: "POST",
    headers: getProxyHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay payments error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getJoonapayPayment(
  uuid: string
): Promise<JoonapayApiResponse<PaymentRequestDetail>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payments/${uuid}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay get payment error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function cancelJoonapayPayment(
  uuid: string
): Promise<JoonapayApiResponse<null>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payments/${uuid}/cancel`, {
    method: "POST",
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay cancel payment error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export interface PayoutItem {
  entity_uuid: string;                     // UUID du bénéficiaire (voir Entités ci-dessous)
  amount: number;                          // min 100 XOF
  phone: string;                           // format E.164
  payment_method_uuid: string;             // doit avoir transfer_status: active
  merchant_transaction_id?: string;        // identifiant interne pour CE payout individuel
  description?: string;
}

export interface CreatePayoutParams {
  country_uuid: string;                    // requis — obtenu via GET /misc (transfer_enabled: true)
  payouts: PayoutItem[];                   // 1 à 100 items
  merchant_transaction_id?: string;        // identifiant interne pour le GROUPE de payouts
  description?: string;
  currency?: string;
  fee_bearer?: "MERCHANT" | "CUSTOMER";
  webhook_url?: string;
}

export interface JoonapayPayoutMethodRef {
  uuid: string;
  name: string;
  code: string;
}

export interface JoonapayPayoutEntityRef {
  uuid: string;
  name: string;
}

// Détail d'un payout individuel à l'intérieur d'un groupe.
// Les champs joonapay_fee / processor_fee / total_charge_to_business ne sont
// présents que dans la réponse de CRÉATION (PayoutCreatedResponse), pas dans
// GET /payouts/{uuid}.
export interface JoonapayPayoutDetailItem {
  uuid: string;
  amount: number;
  phone: string;
  status: "NEW" | "PENDING" | "SUCCESS" | "FAILED";
  payment_method: JoonapayPayoutMethodRef;
  entity: JoonapayPayoutEntityRef;
  description?: string;
  completed_at?: string;
  failed_at?: string;
  failure_reason?: string;
  joonapay_fee?: number;
  processor_fee?: number;
  total_charge_to_business?: number;
  created_at?: string;
}

export interface JoonapayPayoutGroupSummary {
  uuid: string;
  reference: string;
  merchant_transaction_id?: string;
  amount: number;
  currency: string;
  fee_bearer: "MERCHANT" | "CUSTOMER";
  status: "NEW" | "AWAITING_VALIDATION" | "PROCESSING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  total_payouts: number;
  successful_payouts: number;
  failed_payouts: number;
  pending_payouts: number;
  description?: string;
  country: { uuid: string; code: string; name: string };
  created_at: string;
}

// Détail complet d'un groupe (GET /payouts/{uuid}) — réponse PLATE, pas
// imbriquée dans payout_group, contrairement à la réponse de création.
export interface JoonapayPayoutGroupDetail extends JoonapayPayoutGroupSummary {
  payouts: JoonapayPayoutDetailItem[];
}

// Réponse de CRÉATION (POST /payouts) — imbriquée dans `payout_group`,
// avec des totaux en plus.
export interface CreatePayoutResult {
  payout_group: JoonapayPayoutGroupSummary & {
    payouts: JoonapayPayoutDetailItem[];
    totals?: {
      total_amount: number;
      total_fees: number;
      total_charge: number;
    };
  };
}

export async function createJoonapayPayout(
  params: CreatePayoutParams
): Promise<JoonapayApiResponse<CreatePayoutResult>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payouts`, {
    method: "POST",
    headers: getProxyHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay payouts error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function listJoonapayPayouts(params?: {
  status?: "NEW" | "AWAITING_VALIDATION" | "PROCESSING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  from_date?: string; // YYYY-MM-DD
  to_date?: string;   // YYYY-MM-DD
  country_uuid?: string;
}): Promise<JoonapayApiResponse<JoonapayPayoutGroupSummary[]>> {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : "";
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payouts${qs}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay list payouts error ${res.status}: ${text}`);
  }
  return res.json();
}

// Note: réponse PLATE (pas de wrapper payout_group), contrairement à la création.
export async function getJoonapayPayout(
  uuid: string
): Promise<JoonapayApiResponse<JoonapayPayoutGroupDetail>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payouts/${uuid}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay get payout error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Entités (bénéficiaires / clients) ───────────────────────────────────────

export interface JoonapayMobileMoneyAccount {
  uuid: string;
  phone: string;
  payment_method_uuid: string;
  is_default: boolean;
}

export interface JoonapayBankAccount {
  uuid: string;
  country_uuid: string;
  bank_name: string;
  account_holder_name: string;
  iban?: string;
  bic_swift?: string;
  routing_number?: string;
  account_number?: string;
  sort_code?: string;
  is_default: boolean;
}

export interface JoonapayEntity {
  uuid: string;
  name: string;
  type: "CLIENT" | "VENDOR";
  email?: string;
  country_uuid: string;
  image_url?: string;
  mobile_money_accounts: JoonapayMobileMoneyAccount[];
  bank_accounts: JoonapayBankAccount[];
  created_at: string;
  updated_at: string;
}

export async function listJoonapayEntities(params?: {
  search?: string;
  type?: "CLIENT" | "VENDOR";
  phone?: string;
  email?: string;
  per_page?: number;
}): Promise<JoonapayApiResponse<{ entities: JoonapayEntity[]; pagination: JoonapayPagination }>> {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : "";
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/entities${qs}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay list entities error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getJoonapayEntity(
  uuid: string
): Promise<JoonapayApiResponse<{ entity: JoonapayEntity }>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/entities/${uuid}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay get entity error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createJoonapayEntity(params: {
  name: string;
  type: "CLIENT" | "VENDOR";
  phone: string;
  country_code: string;
  country_uuid: string;
  email?: string;
  payment_method_uuid?: string;
}): Promise<JoonapayApiResponse<{ entity: JoonapayEntity }>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/entities`, {
    method: "POST",
    headers: getProxyHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay create entity error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface UpdateEntityParams {
  name?: string;
  type?: "CLIENT" | "VENDOR";
  email?: string;
  country_uuid?: string;
  mobile_money_accounts?: {
    uuid?: string;
    phone: string;
    payment_method_uuid?: string;
    is_default?: boolean;
  }[];
  bank_accounts?: {
    uuid?: string;
    country_uuid: string;
    bank_name: string;
    account_holder_name: string;
    iban?: string;
    bic_swift?: string;
    routing_number?: string;
    account_number?: string;
    sort_code?: string;
    is_default?: boolean;
  }[];
}

export async function updateJoonapayEntity(
  uuid: string,
  params: UpdateEntityParams
): Promise<JoonapayApiResponse<{ entity: JoonapayEntity }>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/entities/${uuid}`, {
    method: "PATCH",
    headers: getProxyHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay update entity error ${res.status}: ${text}`);
  }
  return res.json();
}