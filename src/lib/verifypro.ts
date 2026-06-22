const VERIFYPRO_BASE_URL = "https://verifyproafrica.lfdweb.com/api/v1";

function getVerifyProHeaders() {
  const apiKey = process.env.VERIFYPRO_API_KEY;
  if (!apiKey) throw new Error("Clé VerifyPro manquante (VERIFYPRO_API_KEY)");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export interface CreateSessionParams {
  type: "full-kyc" | "document" | "face" | "liveness" | "email" | "phone" | "aml";
  documentType?: "national_id" | "passport" | "driving_license" | "residence_permit";
  redirectUrl?: string;
  expiresInMinutes?: number;
  prefill?: { email?: string; firstName?: string; lastName?: string; phone?: string };
  metadata?: Record<string, string>;
}

export interface CreateSessionResult {
  sessionId: string;
  verificationUrl: string;
  expiresAt: string;
}

export async function createVerifyProSession(params: CreateSessionParams): Promise<CreateSessionResult> {
  const res = await fetch(`${VERIFYPRO_BASE_URL}/sessions`, {
    method: "POST",
    headers: getVerifyProHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`VerifyPro session error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface SessionStatusResult {
  status: "pending" | "viewed" | "completed" | "expired";
  verificationId?: string;
  [key: string]: unknown;
}

export async function getVerifyProSessionStatus(sessionId: string): Promise<SessionStatusResult> {
  const res = await fetch(`${VERIFYPRO_BASE_URL}/sessions?sessionId=${encodeURIComponent(sessionId)}`, {
    headers: getVerifyProHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`VerifyPro session status error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface VerificationResult {
  id: string;
  status: string;
  overallScore: number;
  riskLevel: "low" | "medium" | "high";
  fraudDetected: boolean;
  extractedData?: {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    docNumber?: string;
    expiryDate?: string;
    nationality?: string;
    expired?: boolean;
    tamperingDetected?: boolean;
    confidenceScore?: number;
  };
  faceMatch?: { matched: boolean; similarityScore: number; livenessConfirmed: boolean };
  amlResult?: { sanctionsMatch: boolean; pepMatch: boolean; kycRiskScore: number };
  completedAt?: string;
}
