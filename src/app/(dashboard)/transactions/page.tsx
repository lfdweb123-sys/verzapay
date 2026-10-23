"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCompany } from "@/lib/company-context";
import { TxBadge, PayoutBadge, MethodPill, EmptyState, Spinner } from "@/components/ui/badges";
import { CreditCard, Search, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences-context";
import type { Transaction, Payout } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

type UnifiedRow =
  | { kind: "in"; id: string; createdAt: number; amount: number; status: string; method: string; counterparty: string; sub?: string }
  | { kind: "out"; id: string; createdAt: number; amount: number; status: string; method: string; counterparty: string; sub?: string };

const DIRECTION_FILTERS = [
  { label: "Tout", value: "all" as const },
  { label: "Entrants", value: "in" as const },
  { label: "Sortants", value: "out" as const },
];

export default function TransactionsPage() {
  const { activeCompany } = useCompany();
  const { formatAmount } = usePreferences();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");

  useEffect(() => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    const unsub1 = onSnapshot(
      query(collection(db, "companies", activeCompany.id, "transactions"), orderBy("createdAt", "desc"), limit(150)),
      (snap) => setTransactions(snap.docs.map((d) => d.data() as Transaction))
    );
    const unsub2 = onSnapshot(
      query(collection(db, "companies", activeCompany.id, "payouts"), orderBy("createdAt", "desc"), limit(150)),
      (snap) => { setPayouts(snap.docs.map((d) => d.data() as Payout)); setLoading(false); }
    );
    return () => { unsub1(); unsub2(); };
  }, [activeCompany?.id]);

  const rows: UnifiedRow[] = [
    ...transactions.map((t): UnifiedRow => ({
      kind: "in", id: t.id, createdAt: t.createdAt, amount: t.amount, status: t.status,
      method: t.method, counterparty: t.customerName ?? t.customerPhone ?? "Client", sub: t.description,
    })),
    ...payouts.map((p): UnifiedRow => ({
      kind: "out", id: p.id, createdAt: p.createdAt, amount: p.amount, status: p.status,
      method: p.method, counterparty: p.recipientName ?? p.recipientPhone ?? "Bénéficiaire", sub: p.note ?? undefined,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  const filtered = rows.filter((r) => {
    if (direction !== "all" && r.kind !== direction) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return r.counterparty.toLowerCase().includes(q) || r.id.includes(q);
  });
  const pg = usePagination(filtered, 20, search);

  const totalIn = transactions.filter((t) => t.status === "completed").reduce((s, t) => s + t.amount, 0);
  const totalOut = payouts.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Transactions</h1>
        <p className="text-sm text-ink-500">{activeCompany?.name} — Vue unifiée des flux entrants et sortants</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><ArrowDownLeft size={12} /> Total entrant</p>
          <p className="text-xl font-medium mt-1 tabular-nums text-success-700">{formatAmount(totalIn)}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><ArrowUpRight size={12} /> Total sortant</p>
          <p className="text-xl font-medium mt-1 tabular-nums text-danger-700">{formatAmount(totalOut)}</p>
        </div>
        <div className="card-base p-4 hidden sm:block">
          <p className="text-xs text-ink-500">Solde net du flux</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{formatAmount(totalIn - totalOut)}</p>
        </div>
      </div>

      <div className="card-base p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, référence…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {DIRECTION_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDirection(f.value)}
              className={`h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                direction === f.value ? "bg-brand-700 text-white" : "bg-white border border-ink-200 text-ink-600 hover:bg-ink-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucune transaction trouvée" description="Essayez de modifier vos filtres." icon={CreditCard} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Contrepartie</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Méthode</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Statut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {pg.pageItems.map((r) => (
                  <tr key={r.kind + r.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.kind === "in" ? (
                        <span className="inline-flex items-center gap-1 text-success-700"><ArrowDownLeft size={13} /> Entrant</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-danger-700"><ArrowUpRight size={13} /> Sortant</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-ink-900">{r.counterparty}</p>
                      {r.sub && <p className="text-xs text-ink-500">{r.sub}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><MethodPill method={r.method as Transaction["method"]} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.kind === "in" ? <TxBadge status={r.status as Transaction["status"]} /> : <PayoutBadge status={r.status as Payout["status"]} />}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{formatDateTime(r.createdAt)}</td>
                    <td className={"px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums " + (r.kind === "in" ? "text-success-700" : "text-danger-700")}>
                      {r.kind === "in" ? "+" : "-"}{formatAmount(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}
