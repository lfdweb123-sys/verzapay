"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCompany } from "@/lib/company-context";
import { TxBadge, MethodPill, EmptyState, Spinner } from "@/components/ui/badges";
import { ArrowDownLeft, Search } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences-context";
import Link from "next/link";
import type { Transaction, TransactionStatus } from "@/types";

const STATUS_FILTERS: { label: string; value: TransactionStatus | "all" }[] = [
  { label: "Tous", value: "all" },
  { label: "Complétés", value: "completed" },
  { label: "En attente", value: "pending" },
  { label: "Échoués", value: "failed" },
];

export default function PaymentsPage() {
  const { activeCompany } = useCompany();
  const { formatAmount } = usePreferences();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "all">("all");

  useEffect(() => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    const q = query(
      collection(db, "companies", activeCompany.id, "transactions"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => d.data() as Transaction));
      setLoading(false);
    });
  }, [activeCompany?.id]);

  const filtered = transactions.filter((t) => {
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || t.customerName?.toLowerCase().includes(q) || t.customerPhone?.includes(q) || t.id.includes(q);
    return matchStatus && matchSearch;
  });

  const totalFiltered = filtered.filter(t => t.status === "completed").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Paiements entrants</h1>
          <p className="text-sm text-ink-500">{activeCompany?.name}</p>
        </div>
        <Link href="/payments/new" className="btn-primary h-9 text-sm self-start">
          + Créer un lien de paiement
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Total reçu (filtré)</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{formatAmount(totalFiltered)}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Transactions affichées</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{filtered.length}</p>
        </div>
        <div className="card-base p-4 hidden sm:block">
          <p className="text-xs text-ink-500">Taux de succès</p>
          <p className="text-xl font-medium mt-1 tabular-nums">
            {transactions.length
              ? Math.round((transactions.filter(t => t.status === "completed").length / transactions.length) * 100) + "%"
              : "—"}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="card-base p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher un client, téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === f.value
                  ? "bg-brand-700 text-white"
                  : "bg-white border border-ink-200 text-ink-600 hover:bg-ink-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucun paiement trouvé" description="Essayez de modifier vos filtres." icon={ArrowDownLeft} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Client</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Méthode</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Statut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Montant</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Commission</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-ink-900">{tx.customerName ?? "—"}</p>
                      <p className="text-xs text-ink-500">{tx.customerPhone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><MethodPill method={tx.method} /></td>
                    <td className="px-4 py-3 whitespace-nowrap"><TxBadge status={tx.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{formatDateTime(tx.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums">{formatAmount(tx.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-xs text-ink-500 tabular-nums">{formatAmount(tx.commission)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums text-success-700">{formatAmount(tx.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
