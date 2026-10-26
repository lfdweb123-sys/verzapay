// Appel dédié au checkout hébergé : débit Mobile Money sans page du partenaire
// (POST /payments/{uuid}/process). Passe par le même proxy (IP fixe) que le reste.
const PROXY_URL = process.env.JOONAPAY_PROXY_URL;

export interface ProcessPaymentParams {
  payment_method_uuid: string;
  phone: string; // E.164
  payment_mode?: "OTP" | "PUSH";
  otp?: string;
  customer_name?: string;
  email?: string;
}

export interface ProcessPaymentResult {
  payment_uuid: string;
  payment_reference: string;
  amount: number;
  status: string; // typiquement PENDING — jamais un statut final
  payment_request_uuid: string;
}

export class ProcessError extends Error {
  constructor(message: string, public status: number, public raw: string) {
    super(message);
  }
}

export async function processJoonapayPayment(
  paymentUuid: string,
  params: ProcessPaymentParams
): Promise<{ success: boolean; message: string; data: ProcessPaymentResult }> {
  if (!PROXY_URL || !process.env.PROXY_SECRET) throw new Error("Passerelle de paiement non configurée");
  const res = await fetch(`${PROXY_URL}/api/v1/developer/payments/${paymentUuid}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Proxy-Secret": process.env.PROXY_SECRET },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new ProcessError(`process ${res.status}`, res.status, text);
  return JSON.parse(text);
}
