"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/badges";
import { Wallet, Search, ChevronRight, RefreshCw, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatXOF, initials, colorForName } from "@/lib/utils";
import type { Company } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface JoonapayBalance {
  country: string;
  country_code: string;
  currency: string;
  service: "PAYIN" | "PAYOUT";
  balance: number;
}

export default function AdminWalletsPage() {
  const { user } = useAuth();
  const { show } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  const [joonaBalances, setJoonaBalances] = useState<JoonapayBalance[]>([]);
  const [loadingJoona, setLoadingJoona] = useState(true);

  const [search, setSearch] = useState("");

  // ── Entreprises Firestore ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/companies?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setCompanies(
          (data.companies ?? []).sort(
            (a: Company, b: Company) => (b.walletBalance ?? 0) - (a.walletBalance ?? 0)
          )
        );
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoadingCompanies(false);
      }
    })();
  }, [user]);

  // ── Soldes JoonaPay réels ─────────────────────────────────────────────────
  const fetchJoonaBalances = async () => {
    setLoadingJoona(true);
    try {
      const res = await fetch(`/api/admin/joonapay-balance?uid=${user?.uid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur JoonaPay");
      setJoonaBalances(data.balances ?? []);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoadingJoona(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchJoonaBalances();
  }, [user]);

  // ── Calculs ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);
  const pg = usePagination(filtered, 20, search);

  const totalFirestore = companies.reduce((s, c) => s + (c.walletBalance ?? 0), 0);

  const totalPayin  = joonaBalances.filter((b) => b.service === "PAYIN").reduce((s, b)  => s + b.balance, 0);
  const totalPayout = joonaBalances.filter((b) => b.service === "PAYOUT").reduce((s, b) => s + b.balance, 0);

  return (
    <div className="space-y-5">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Portefeuilles</h1>
          <p className="text-sm text-ink-500">Soldes plateforme et entreprises</p>
        </div>
        <button
          onClick={fetchJoonaBalances}
          disabled={loadingJoona}
          className="btn-secondary h-9 px-3 gap-1.5 text-xs"
        >
          <RefreshCw size={13} className={loadingJoona ? "animate-spin" : ""} />
          Actualiser JoonaPay
        </button>
      </div>

      {/* Soldes JoonaPay */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-brand-700 p-5 text-white">
          <p className="text-brand-100 text-xs flex items-center gap-1.5">
            <ArrowDownLeft size={13} /> Solde PAYIN JoonaPay
          </p>
          {loadingJoona ? (
            <div className="mt-2 h-8 w-32 rounded-lg bg-brand-600 animate-pulse" />
          ) : (
            <p className="text-2xl font-medium mt-1.5 tabular-nums">{formatXOF(totalPayin)}</p>
          )}
          {!loadingJoona && joonaBalances.filter((b) => b.service === "PAYIN").map((b) => (
            <p key={b.country_code + b.service} className="text-brand-200 text-xs mt-1 tabular-nums">
              {b.country} · {formatXOF(b.balance)}
            </p>
          ))}
        </div>

        <div className="rounded-2xl bg-ink-800 p-5 text-white">
          <p className="text-ink-300 text-xs flex items-center gap-1.5">
            <ArrowUpRight size={13} /> Solde PAYOUT JoonaPay
          </p>
          {loadingJoona ? (
            <div className="mt-2 h-8 w-32 rounded-lg bg-ink-700 animate-pulse" />
          ) : (
            <p className="text-2xl font-medium mt-1.5 tabular-nums">{formatXOF(totalPayout)}</p>
          )}
          {!loadingJoona && joonaBalances.filter((b) => b.service === "PAYOUT").map((b) => (
            <p key={b.country_code + b.service} className="text-ink-400 text-xs mt-1 tabular-nums">
              {b.country} · {formatXOF(b.balance)}
            </p>
          ))}
        </div>
      </div>

      {/* Solde cumulé Firestore */}
      <div className="card-base p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-ink-600">
          <Wallet size={15} />
          Solde cumulé  (des marchands sur Verzapay)
        </div>
        <p className="text-sm font-medium tabular-nums text-ink-900">{formatXOF(totalFirestore)}</p>
      </div>

      {/* Recherche */}
      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher une entreprise…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9 h-9"
          />
        </div>
      </div>

      {/* Liste entreprises */}
      <div className="card-base overflow-hidden">
        {loadingCompanies ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucune entreprise" icon={Wallet} />
        ) : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((c) => (
              <Link
                key={c.id}
                href={`/admin/companies/${c.id}`}
                className="flex items-center justify-between px-4 py-3.5 hover:bg-ink-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-semibold"
                    style={{ background: c.logoColor ?? colorForName(c.name) }}
                  >
                    {initials(c.name)}
                  </div>
                  <p className="text-sm font-medium text-ink-900 truncate">{c.name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-medium tabular-nums">{formatXOF(c.walletBalance ?? 0)}</p>
                  <ChevronRight size={15} className="text-ink-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}