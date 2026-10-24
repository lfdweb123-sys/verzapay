export type Status = "operational" | "degraded" | "outage";

export interface Check {
  id: string;
  name: string;
  description: string;
  status: Status;
  latencyMs: number | null;
}

export const PROBE_TIMEOUT_MS = 5_000;
export const PROBE_SLOW_MS = 2_500;

/**
 * Exécute réellement la vérification : opérationnel si elle répond vite, ralenti si elle
 * répond au-delà du seuil, indisponible si elle échoue (erreur, refus) ou dépasse le délai.
 */
export async function probe(
  id: string,
  name: string,
  description: string,
  fn: () => Promise<unknown>,
  limits: { timeoutMs?: number; slowMs?: number } = {}
): Promise<Check> {
  const timeoutMs = limits.timeoutMs ?? PROBE_TIMEOUT_MS;
  const slowMs = limits.slowMs ?? PROBE_SLOW_MS;
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
    ]);
    const latencyMs = Date.now() - started;
    return { id, name, description, status: latencyMs > slowMs ? "degraded" : "operational", latencyMs };
  } catch {
    return { id, name, description, status: "outage", latencyMs: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
