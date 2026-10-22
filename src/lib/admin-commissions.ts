import { adminDb } from "@/lib/firebase-admin";

export const COMMISSION_ROW_LIMIT = 5000;

export interface CommissionRow {
  id: string;
  companyId: string;
  companyName: string;
  createdAt: number;
  method: string;
  currency: string;
  amount: number;
  commission: number;
  netAmount: number;
  merchantReference: string;
  customerName: string;
}

export interface CommissionData {
  from: number;
  to: number;
  currency: string;
  currencies: string[];
  truncated: boolean;
  totals: { volume: number; commission: number; net: number; count: number; avgCommission: number; effectiveRate: number };
  daily: { date: string; volume: number; commission: number; count: number }[];
  byMethod: { method: string; volume: number; commission: number; count: number }[];
  byCompany: { companyId: string; name: string; volume: number; commission: number; count: number; rate: number }[];
  rows: CommissionRow[];
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Lit les paiements complétés de la période (Admin SDK, une seule requête
 * limitée) et calcule toutes les agrégations de commissions Verzapay.
 */
export async function loadCommissionData(opts: { from: number; to: number; currency?: string }): Promise<CommissionData> {
  const db = adminDb();
  const snap = await db
    .collectionGroup("transactions")
    .where("status", "==", "completed")
    .where("createdAt", ">=", opts.from)
    .where("createdAt", "<=", opts.to)
    .orderBy("createdAt", "desc")
    .limit(COMMISSION_ROW_LIMIT + 1)
    .get();

  const truncated = snap.size > COMMISSION_ROW_LIMIT;
  const docs = snap.docs.slice(0, COMMISSION_ROW_LIMIT);

  const currencies = Array.from(new Set(docs.map((d) => String(d.data().currency ?? "XOF")))).sort();
  const currency = opts.currency && currencies.includes(opts.currency) ? opts.currency : currencies.includes("XOF") ? "XOF" : currencies[0] ?? "XOF";

  const filtered = docs.filter((d) => String(d.data().currency ?? "XOF") === currency);

  const companyIds = Array.from(new Set(filtered.map((d) => String(d.data().companyId ?? d.ref.parent.parent?.id ?? ""))))
    .filter(Boolean);
  const names = new Map<string, string>();
  for (let i = 0; i < companyIds.length; i += 100) {
    const refs = companyIds.slice(i, i + 100).map((id) => db.collection("companies").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => names.set(s.id, String(s.data()?.name ?? s.id)));
  }

  const rows: CommissionRow[] = filtered.map((d) => {
    const t = d.data();
    const companyId = String(t.companyId ?? d.ref.parent.parent?.id ?? "");
    const amount = Number(t.amount ?? 0);
    const commission = Number(t.commission ?? 0);
    return {
      id: d.id,
      companyId,
      companyName: names.get(companyId) ?? companyId,
      createdAt: Number(t.createdAt ?? 0),
      method: String(t.method ?? "—"),
      currency,
      amount,
      commission,
      netAmount: Number(t.netAmount ?? amount - commission),
      merchantReference: String(t.merchantReference ?? ""),
      customerName: String(t.customerName ?? ""),
    };
  });

  const volume = rows.reduce((s, r) => s + r.amount, 0);
  const commission = rows.reduce((s, r) => s + r.commission, 0);
  const net = rows.reduce((s, r) => s + r.netAmount, 0);

  const dailyMap = new Map<string, { date: string; volume: number; commission: number; count: number }>();
  const methodMap = new Map<string, { method: string; volume: number; commission: number; count: number }>();
  const companyMap = new Map<string, { companyId: string; name: string; volume: number; commission: number; count: number; rate: number }>();

  for (const r of rows) {
    const dk = dayKey(r.createdAt);
    const d = dailyMap.get(dk) ?? { date: dk, volume: 0, commission: 0, count: 0 };
    d.volume += r.amount; d.commission += r.commission; d.count += 1;
    dailyMap.set(dk, d);

    const m = methodMap.get(r.method) ?? { method: r.method, volume: 0, commission: 0, count: 0 };
    m.volume += r.amount; m.commission += r.commission; m.count += 1;
    methodMap.set(r.method, m);

    const c = companyMap.get(r.companyId) ?? { companyId: r.companyId, name: r.companyName, volume: 0, commission: 0, count: 0, rate: 0 };
    c.volume += r.amount; c.commission += r.commission; c.count += 1;
    companyMap.set(r.companyId, c);
  }

  // Jours sans transaction inclus, pour une courbe continue
  const daily: CommissionData["daily"] = [];
  for (let t = Date.UTC(new Date(opts.from).getUTCFullYear(), new Date(opts.from).getUTCMonth(), new Date(opts.from).getUTCDate());
       t <= opts.to && daily.length < 400; t += 24 * 3600 * 1000) {
    const k = dayKey(t);
    daily.push(dailyMap.get(k) ?? { date: k, volume: 0, commission: 0, count: 0 });
  }

  const byCompany = Array.from(companyMap.values())
    .map((c) => ({ ...c, rate: c.volume > 0 ? c.commission / c.volume : 0 }))
    .sort((a, b) => b.commission - a.commission);

  return {
    from: opts.from,
    to: opts.to,
    currency,
    currencies,
    truncated,
    totals: {
      volume, commission, net, count: rows.length,
      avgCommission: rows.length ? commission / rows.length : 0,
      effectiveRate: volume > 0 ? commission / volume : 0,
    },
    daily,
    byMethod: Array.from(methodMap.values()).sort((a, b) => b.commission - a.commission),
    byCompany,
    rows,
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], lines: (string | number)[][]): string {
  // BOM + séparateur ";" : s'ouvre directement dans Excel en français
  return "\uFEFF" + [headers, ...lines].map((l) => l.map(csvCell).join(";")).join("\n");
}
