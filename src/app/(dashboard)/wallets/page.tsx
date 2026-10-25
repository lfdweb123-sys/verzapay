"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCompany } from "@/lib/company-context";
import { EmptyState, Spinner } from "@/components/ui/badges";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Building2 } from "lucide-react";
import { formatDateTime, initials, colorForName } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences-context";
import Link from "next/link";
import type { LedgerEntry } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { ExportMenu } from "@/components/export-menu";

export default function WalletsPage() {
  const { companies, activeCompany } = useCompany();
  const { formatAmount } = usePreferences();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const pg = usePagination(entries, 20);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    const q = query(
      collection(db, "companies", activeCompany.id, "ledger"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    return onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
      setLoading(false);
    });
  }, [activeCompany?.id]);

  const totalCredits = entries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
  const totalDebits = entries.filter((e) => e.type === "debit").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Portefeuilles</h1>
          <p className="text-sm text-ink-500">Soldes et journal de mouvements par entreprise</p>
        </div>
        <ExportMenu type="ledger" />
      </div>

      {/* Vue globale multi-entreprise */}
      {companies.length > 1 && (
        <div className="card-base overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100">
            <p className="text-sm font-medium text-ink-900">Toutes vos entreprises</p>
          </div>
          <div className="divide-y divide-ink-50">
            {companies.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-semibold"
                    style={{ background: c.logoColor ?? colorForName(c.name) }}
                  >
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{c.name}</p>
                    <p className="text-xs text-ink-500">{c.kycStatus === "approved" ? "Vérifié" : "Non vérifié"}</p>
                  </div>
                </div>
                <p className="text-sm font-medium text-ink-900 tabular-nums shrink-0">{formatAmount(c.walletBalance ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Solde de l'entreprise active */}
      <div className="rounded-2xl bg-brand-700 p-6 text-white relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-100 text-xs mb-1.5">
              <Wallet size={14} />
              Solde disponible — {activeCompany?.name ?? "—"}
            </div>
            <p className="text-3xl font-medium tabular-nums">{formatAmount(activeCompany?.walletBalance ?? 0)}</p>
          </div>
          {(activeCompany?.walletBalance ?? 0) > 0 && (
            <Link href="/payouts" className="hidden sm:inline-flex btn-secondary !bg-white/10 !border-white/20 !text-white hover:!bg-white/20">
              Retirer des fonds
            </Link>
          )}
        </div>
        <div className="relative grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/15">
          <div>
            <p className="text-brand-100 text-[11px] flex items-center gap-1"><ArrowDownCircle size={12} /> Total crédité</p>
            <p className="text-sm font-medium mt-0.5 tabular-nums">{formatAmount(totalCredits)}</p>
          </div>
          <div>
            <p className="text-brand-100 text-[11px] flex items-center gap-1"><ArrowUpCircle size={12} /> Total débité</p>
            <p className="text-sm font-medium mt-0.5 tabular-nums">{formatAmount(totalDebits)}</p>
          </div>
        </div>
      </div>

      {/* Journal des mouvements */}
      <div className="card-base overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100">
          <p className="text-sm font-medium text-ink-900">Journal des mouvements</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : entries.length === 0 ? (
          <EmptyState title="Aucun mouvement" description="Les crédits et débits de votre solde apparaîtront ici." icon={Wallet} />
        ) : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 " +
                      (entry.type === "credit" ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700")
                    }
                  >
                    {entry.type === "credit" ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{entry.label}</p>
                    <p className="text-xs text-ink-500">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={"text-sm font-medium tabular-nums " + (entry.type === "credit" ? "text-success-700" : "text-danger-700")}>
                    {entry.type === "credit" ? "+" : "-"}{formatAmount(entry.amount)}
                  </p>
                  <p className="text-[11px] text-ink-400 tabular-nums">Solde : {formatAmount(entry.balanceAfter)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}
