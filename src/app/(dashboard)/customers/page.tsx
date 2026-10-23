"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCompany } from "@/lib/company-context";
import { usePreferences } from "@/lib/preferences-context";
import { EmptyState, Spinner, TxBadge, MethodPill } from "@/components/ui/badges";
import { Users, Search, X, Phone, Mail } from "lucide-react";
import { formatDate, formatDateTime, initials } from "@/lib/utils";
import type { Transaction } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface AggregatedCustomer {
  key: string;
  name: string;
  phone?: string;
  email?: string;
  totalSpent: number;
  transactionsCount: number;
  lastTransactionAt: number;
  transactions: Transaction[];
}

export default function CustomersPage() {
  const { activeCompany } = useCompany();
  const { formatAmount } = usePreferences();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AggregatedCustomer | null>(null);

  useEffect(() => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    const q = query(
      collection(db, "companies", activeCompany.id, "transactions"),
      orderBy("createdAt", "desc"),
      limit(300)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => d.data() as Transaction));
      setLoading(false);
    });
  }, [activeCompany?.id]);

  // Agrégation des clients à partir des transactions complétées
  const customers = useMemo<AggregatedCustomer[]>(() => {
    const map = new Map<string, AggregatedCustomer>();
    for (const tx of transactions) {
      if (tx.status !== "completed") continue;
      const key = tx.customerPhone || tx.customerEmail || tx.customerName || tx.id;
      const existing = map.get(key);
      if (existing) {
        existing.totalSpent += tx.amount;
        existing.transactionsCount += 1;
        existing.lastTransactionAt = Math.max(existing.lastTransactionAt, tx.createdAt);
        existing.transactions.push(tx);
      } else {
        map.set(key, {
          key,
          name: tx.customerName || "Client",
          phone: tx.customerPhone ?? undefined,
          email: tx.customerEmail ?? undefined,
          totalSpent: tx.amount,
          transactionsCount: 1,
          lastTransactionAt: tx.createdAt,
          transactions: [tx],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [transactions]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q);
  });
  const pg = usePagination(filtered, 20, search);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Clients</h1>
        <p className="text-sm text-ink-500">{activeCompany?.name} — basé sur l&apos;historique des paiements reçus</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Clients uniques</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{customers.length}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Total encaissé</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{formatAmount(customers.reduce((s, c) => s + c.totalSpent, 0))}</p>
        </div>
        <div className="card-base p-4 hidden sm:block">
          <p className="text-xs text-ink-500">Panier moyen</p>
          <p className="text-xl font-medium mt-1 tabular-nums">
            {customers.length ? formatAmount(customers.reduce((s, c) => s + c.totalSpent, 0) / customers.length) : "—"}
          </p>
        </div>
      </div>

      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher un client par nom, téléphone, email…"
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
          <EmptyState
            title="Aucun client pour le moment"
            description="Vos clients apparaîtront ici dès leur premier paiement réussi."
            icon={Users}
          />
        ) : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelected(c)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink-50/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-medium shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{c.name}</p>
                    <p className="text-xs text-ink-500 truncate">{c.phone || c.email || "—"}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-ink-900 tabular-nums">{formatAmount(c.totalSpent)}</p>
                  <p className="text-xs text-ink-500">{c.transactionsCount} transaction{c.transactionsCount > 1 ? "s" : ""}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Panneau détail client */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-popover animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white">
              <p className="font-medium text-ink-900">Détail client</p>
              <button onClick={() => setSelected(null)} className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-brand-700 flex items-center justify-center text-white font-medium">
                  {initials(selected.name)}
                </div>
                <div>
                  <p className="font-medium text-ink-900">{selected.name}</p>
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {selected.phone && <span className="text-xs text-ink-500 flex items-center gap-1"><Phone size={11} />{selected.phone}</span>}
                    {selected.email && <span className="text-xs text-ink-500 flex items-center gap-1"><Mail size={11} />{selected.email}</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-ink-50 rounded-lg p-3">
                  <p className="text-xs text-ink-500">Total dépensé</p>
                  <p className="font-medium tabular-nums">{formatAmount(selected.totalSpent)}</p>
                </div>
                <div className="bg-ink-50 rounded-lg p-3">
                  <p className="text-xs text-ink-500">Dernier achat</p>
                  <p className="font-medium">{formatDate(selected.lastTransactionAt)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-2">Historique des transactions</p>
                <div className="space-y-2">
                  {selected.transactions
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-lg border border-ink-100">
                        <div>
                          <p className="text-sm font-medium tabular-nums">{formatAmount(tx.amount)}</p>
                          <p className="text-xs text-ink-500">{formatDateTime(tx.createdAt)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <MethodPill method={tx.method} />
                          <TxBadge status={tx.status} />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}