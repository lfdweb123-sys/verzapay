import { adminDb } from "@/lib/firebase-admin";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * Rate limiter simple à fenêtre glissante, stocké dans Firestore.
 * Adapté au serverless (pas de mémoire partagée entre invocations).
 * Utilise une clé composite (ex: "2fa-send:uid123" ou "contact:ip:1.2.3.4").
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const db = adminDb();
  const ref = db.collection("rateLimits").doc(key);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data()! : { requests: [] as number[] };

      // Ne garder que les requêtes dans la fenêtre glissante actuelle
      const recentRequests: number[] = (data.requests ?? []).filter(
        (ts: number) => now - ts < windowMs
      );

      if (recentRequests.length >= maxRequests) {
        const oldest = Math.min(...recentRequests);
        const retryAfterSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      recentRequests.push(now);
      tx.set(ref, { requests: recentRequests, updatedAt: now }, { merge: true });

      return { allowed: true, remaining: maxRequests - recentRequests.length };
    });

    return result;
  } catch (err) {
    // En cas d'échec du rate limiter lui-même (ex: Firestore indisponible),
    // on choisit de NE PAS bloquer la requête légitime (fail-open), mais on logue.
    console.error("Rate limit check failed:", err);
    return { allowed: true, remaining: maxRequests };
  }
}

/** Extrait une adresse IP raisonnable depuis les en-têtes de la requête (Vercel/proxy). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
