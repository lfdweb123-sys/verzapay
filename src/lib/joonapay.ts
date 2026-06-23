// lib/joonapay.ts

const JOONAPAY_PROXY_URL = process.env.JOONAPAY_PROXY_URL;

function getProxyHeaders(): Record<string, string> {
  const proxySecret = process.env.PROXY_SECRET;
  if (!JOONAPAY_PROXY_URL) {
    throw new Error("Variable d'environnement JOONAPAY_PROXY_URL manquante");
  }
  if (!proxySecret) {
    throw new Error("Variable d'environnement PROXY_SECRET manquante");
  }
  return {
    "Content-Type": "application/json",
    "X-Proxy-Secret": proxySecret,
  };
}

export interface JoonapayApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors: unknown;
  metadata: {
    request_id: string;
    timestamp: string;
    version: string;
    response_time: string;
  };
}

export interface CreatePaymentParams {
  amount: number;
  currency: string;
  description?: string;
  webhook_url?: string;
  return_url?: string;
}

export interface CreatePaymentResult {
  id: string;
  status: string;
  checkout_url?: string;
  [key: string]: unknown;
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
  id: string
): Promise<JoonapayApiResponse<CreatePaymentResult>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/payments/${id}`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay get payment error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface CreatePayoutParams {
  amount: number;
  currency: string;
  recipient_phone: string;
  payment_method: "mobile_money" | "bank";
  description?: string;
}

export interface CreatePayoutResult {
  id: string;
  status: string;
  [key: string]: unknown;
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

export interface JoonapayBalance {
  balance: number;
  currency: string;
  [key: string]: unknown;
}

export async function getJoonapayBalance(): Promise<JoonapayApiResponse<JoonapayBalance>> {
  const res = await fetch(`${JOONAPAY_PROXY_URL}/api/v1/developer/balance`, {
    headers: getProxyHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay balance error ${res.status}: ${text}`);
  }
  return res.json();
}