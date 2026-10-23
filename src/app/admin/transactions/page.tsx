"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { TxBadge, PayoutBadge, MethodPill, EmptyState, Spinner } from "@/components/ui/badges";
import { CreditCard, Search, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatXOF, formatDateTime } from "@/lib/utils";
import type { Transaction, Payout } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

type Row =
  | { kind: "in"; id: string; createdAt: number; amount: number; status: string; method: string; companyName: string; counterparty: string }
  | { kind: "out"; id: string; createdAt: number; amount: number; status: string; method: string; companyName: string; counterparty: string };

const DIRECTION_FILTERS = [
  { label: "Tout", value: "all" as const },
  { label: "Entrants", value: "in" as const },
  { label: "Sortants", value: "out" as const },
];

export default function AdminTransactionsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [txRes, poRes] = await Promise.all([
          fetch(`/api/admin/transactions?uid=${user.uid}`),
          fetch(`/api/admin/payouts?uid=${user.uid}`),
        ]);
        const txData = await txRes.json();
        const poData = await poRes.json();
        if (!txRes.ok) throw new Error(txData.error ?? "Erreur");
        if (!poRes.ok) throw new Error(poData.error ?? "Erreur");

        const txRows: Row[] = (txData.transactions as (Transaction & { companyName: string })[]).map((t) => ({
          kind: "in", id: t.id, createdAt: t.createdAt, amount: t.amount, status: t.status,
          method: t.method, companyName: t.companyName, counterparty: t.customerName ?? t.customerPhone ?? "Client",
        }));
        const poRows: Row[] = (poData.payouts as (Payout & { companyName: string })[]).map((p) => ({
          kind: "out", id: p.id, createdAt: p.createdAt, amount: p.amount, status: p.status,
          method: p.method, companyName: p.companyName, counterparty: p.recipientName ?? p.recipientPhone ?? "Bénéficiaire",
        }));

        setRows([...txRows, ...poRows].sort((a, b) => b.createdAt - a.createdAt));
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (direction !== "all" && r.kind !== direction) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return r.companyName.toLowerCase().includes(q) || r.counterparty.toLowerCase().includes(q);
    });
  }, [rows, search, direction]);
  const pg = usePagination(filtered, 20, search);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Transactions</h1>
        <p className="text-sm text-ink-500">Vue unifiée de tous les flux de la plateforme</p>
      </div>

      <div className="card-base p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher par entreprise, contrepartie…"
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
          <EmptyState title="Aucune transaction trouvée" icon={CreditCard} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Marchand</th>
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
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-brand-800">{r.companyName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.counterparty}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><MethodPill method={r.method as Transaction["method"]} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.kind === "in" ? <TxBadge status={r.status as Transaction["status"]} /> : <PayoutBadge status={r.status as Payout["status"]} />}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{formatDateTime(r.createdAt)}</td>
                    <td className={"px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums " + (r.kind === "in" ? "text-success-700" : "text-danger-700")}>
                      {r.kind === "in" ? "+" : "-"}{formatXOF(r.amount)}
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
