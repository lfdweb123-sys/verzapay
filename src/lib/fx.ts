import { adminDb } from "@/lib/firebase-admin";

/**
 * Conversion de devises (serveur).
 *
 * - Le LEDGER (solde, commissions, grand livre) est toujours en XOF.
 * - XOF et XAF sont arrimés à l'euro à la parité fixe 655,957 (accord de coopération monétaire) : pas de taux de marché.
 * - Les autres devises viennent d'une API gratuite sans clé (open.er-api.com, secours : currency-api via jsDelivr),
 *   mise en cache mémoire (6 h) et dans Firestore (config/fxRates) pour survivre à une panne de l'API.
 * - Si aucun taux frais ou récent (< 7 jours) n'est disponible, la conversion est REFUSÉE (FxError 503) : on ne devine jamais un taux.
 */

export const LEDGER_CURRENCY = "XOF";
export const EUR_XOF_PEG = 655.957;

export class FxError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

type RatesDoc = { rates: Record<string, number>; fetchedAt: number; source: string }; // base EUR

const TTL_MS = 6 * 60 * 60 * 1000;
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
let mem: RatesDoc | null = null;

function withPegs(rates: Record<string, number>): Record<string, number> {
  return { ...rates, EUR: 1, XOF: EUR_XOF_PEG, XAF: EUR_XOF_PEG };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(7000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchLive(): Promise<RatesDoc> {
  try {
    const j = (await fetchJson("https://open.er-api.com/v6/latest/EUR")) as { result?: string; rates?: Record<string, number> };
    if (j.result === "success" && j.rates && typeof j.rates.USD === "number") {
      return { rates: withPegs(j.rates), fetchedAt: Date.now(), source: "open.er-api.com" };
    }
  } catch (e) {
    console.warn("[fx] open.er-api.com indisponible:", (e as Error).message);
  }
  try {
    const j = (await fetchJson("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json")) as { eur?: Record<string, number> };
    if (j.eur && typeof j.eur.usd === "number") {
      const rates: Record<string, number> = {};
      for (const [k, v] of Object.entries(j.eur)) if (typeof v === "number" && v > 0) rates[k.toUpperCase()] = v;
      return { rates: withPegs(rates), fetchedAt: Date.now(), source: "currency-api (jsDelivr)" };
    }
  } catch (e) {
    console.warn("[fx] currency-api indisponible:", (e as Error).message);
  }
  throw new FxError("Taux de change indisponibles pour le moment.");
}

export async function getRates(): Promise<RatesDoc> {
  if (mem && Date.now() - mem.fetchedAt < TTL_MS) return mem;
  try {
    const live = await fetchLive();
    mem = live;
    try {
      await adminDb().collection("config").doc("fxRates").set(live);
    } catch (e) {
      console.warn("[fx] écriture cache Firestore impossible:", (e as Error).message);
    }
    return live;
  } catch (liveErr) {
    if (mem && Date.now() - mem.fetchedAt < STALE_MAX_MS) return mem;
    try {
      const snap = await adminDb().collection("config").doc("fxRates").get();
      const d = snap.data() as RatesDoc | undefined;
      if (d && d.rates && Date.now() - d.fetchedAt < STALE_MAX_MS) {
        mem = { ...d, rates: withPegs(d.rates) };
        return mem;
      }
    } catch (e) {
      console.warn("[fx] lecture cache Firestore impossible:", (e as Error).message);
    }
    throw liveErr;
  }
}

/** Nombre de décimales usuelles d'une devise (0 pour XOF, JPY...; 2 pour EUR, USD...). */
export function decimalsOf(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function roundTo(amount: number, currency: string): number {
  const f = 10 ** decimalsOf(currency);
  return Math.round(amount * f) / f;
}

export function normalizeCurrency(code: string | null | undefined): string {
  const c = (code ?? LEDGER_CURRENCY).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new FxError("Devise invalide (code ISO à 3 lettres attendu).", 400);
  return c;
}

/** Taux : combien d'unités de `to` pour 1 unité de `from`. */
export async function rate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const pegged = ["EUR", "XOF", "XAF"];
  // Paires arrimées : aucun appel réseau nécessaire.
  if (pegged.includes(from) && pegged.includes(to)) {
    const per = (c: string) => (c === "EUR" ? 1 : EUR_XOF_PEG);
    return per(to) / per(from);
  }
  const { rates } = await getRates();
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) throw new FxError(`Devise non prise en charge : ${!rf ? from : to}.`, 400);
  return rt / rf;
}

export async function convert(amount: number, from: string, to: string): Promise<number> {
  return roundTo(amount * (await rate(from, to)), to);
}

/** Taux exposés au navigateur : unités de chaque devise pour 1 XOF. */
export async function publicRatesPerXof(): Promise<{ rates: Record<string, number>; updatedAt: number; source: string }> {
  const d = await getRates();
  const perXof: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.rates)) perXof[k] = v / EUR_XOF_PEG;
  perXof.XOF = 1;
  return { rates: perXof, updatedAt: d.fetchedAt, source: d.source };
}
