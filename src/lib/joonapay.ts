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
  channel: "MOBILE_MONEY" | "CARD" | "BANK_TRANSFER";
  code: string;
  payment_status: string;
  transfer_status: string;
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
  channel?: "MOBILE_MONEY" | "CARD" | "BANK_TRANSFER";
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
  return_url?: string;
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
): Promise<JoonapayApiResponse<CreatePaymentResult>> {
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
  entity_uuid: string;
  amount: number;                          // min 100 XOF
  phone: string;                           // format E.164
  payment_method_uuid: string;
  description?: string;
}

export interface CreatePayoutParams {
  country_uuid: string;                    // requis — obtenu via GET /misc (transfer_enabled: true)
  payouts: PayoutItem[];                   // 1 à 100 items
  merchant_transaction_id?: string;
  description?: string;
  currency?: string;
  fee_bearer?: "MERCHANT" | "CUSTOMER";
  webhook_url?: string;
}

export interface CreatePayoutResult {
  uuid: string;
  reference: string;
  amount: number;
  currency: string;
  status: "NEW" | "AWAITING_VALIDATION" | "PROCESSING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  total_payouts: number;
  successful_payouts: number;
  failed_payouts: number;
  pending_payouts: number;
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

export async function getJoonapayPayout(
  uuid: string
): Promise<JoonapayApiResponse<CreatePayoutResult>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payouts/${uuid}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay get payout error ${res.status}: ${text}`);
  }
  return res.json();
}