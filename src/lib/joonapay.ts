const JOONAPAY_BASE_URL = "https://apis.joonapay.com/api/v1/developer";

function getJoonapayHeaders(): Record<string, string> {
  const clientKey = process.env.JOONAPAY_CLIENT_KEY;
  const privateKey = process.env.JOONAPAY_PRIVATE_KEY;
  if (!clientKey || !privateKey) {
    throw new Error("Clés Joonapay manquantes (JOONAPAY_CLIENT_KEY / JOONAPAY_PRIVATE_KEY)");
  }
  return {
    "X-Client-Key": clientKey,
    "X-Private-Key": privateKey,
    "Content-Type": "application/json",
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
  const res = await fetch(`${JOONAPAY_BASE_URL}/payments`, {
    method: "POST",
    headers: getJoonapayHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay payments error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getJoonapayPayment(id: string): Promise<JoonapayApiResponse<CreatePaymentResult>> {
  const res = await fetch(`${JOONAPAY_BASE_URL}/payments/${id}`, {
    headers: getJoonapayHeaders(),
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
  const res = await fetch(`${JOONAPAY_BASE_URL}/payouts`, {
    method: "POST",
    headers: getJoonapayHeaders(),
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
  const res = await fetch(`${JOONAPAY_BASE_URL}/balance`, {
    headers: getJoonapayHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Joonapay balance error ${res.status}: ${text}`);
  }
  return res.json();
}
