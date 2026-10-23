"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { TxBadge, MethodPill, EmptyState, Spinner } from "@/components/ui/badges";
import { ArrowDownLeft, Search } from "lucide-react";
import { formatXOF, formatDateTime } from "@/lib/utils";
import type { Transaction } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

type EnrichedTx = Transaction & { companyName: string };

export default function AdminPaymentsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [transactions, setTransactions] = useState<EnrichedTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/transactions?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setTransactions(data.transactions ?? []);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (t) => t.companyName?.toLowerCase().includes(q) || t.customerName?.toLowerCase().includes(q) || t.customerPhone?.includes(q)
    );
  }, [transactions, search]);
  const pg = usePagination(filtered, 20, search);

  const totalVolume = filtered.filter((t) => t.status === "completed").reduce((s, t) => s + t.amount, 0);
  const totalCommission = filtered.filter((t) => t.status === "completed").reduce((s, t) => s + t.commission, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Paiements entrants</h1>
        <p className="text-sm text-ink-500">Tous marchands confondus — traçabilité complète</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Volume total</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{formatXOF(totalVolume)}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Commission Verzapay</p>
          <p className="text-xl font-medium mt-1 tabular-nums text-brand-700">{formatXOF(totalCommission)}</p>
        </div>
        <div className="card-base p-4 hidden sm:block">
          <p className="text-xs text-ink-500">Transactions affichées</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{filtered.length}</p>
        </div>
      </div>

      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher par entreprise, client, téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9 h-9"
          />
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucune transaction" icon={ArrowDownLeft} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Marchand (provenance)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Client</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Méthode</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Statut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {pg.pageItems.map((tx) => (
                  <tr key={tx.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-brand-800">{tx.companyName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-ink-900">{tx.customerName ?? "—"}</p>
                      <p className="text-xs text-ink-500">{tx.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><MethodPill method={tx.method} /></td>
                    <td className="px-4 py-3 whitespace-nowrap"><TxBadge status={tx.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{formatDateTime(tx.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums">{formatXOF(tx.amount)}</td>
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
