"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/badges";
import { Wallet, Search, ChevronRight } from "lucide-react";
import { formatXOF, initials, colorForName } from "@/lib/utils";
import type { Company } from "@/types";

export default function AdminWalletsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/companies?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setCompanies((data.companies ?? []).sort((a: Company, b: Company) => (b.walletBalance ?? 0) - (a.walletBalance ?? 0)));
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const totalBalance = companies.reduce((s, c) => s + (c.walletBalance ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Portefeuilles</h1>
        <p className="text-sm text-ink-500">Soldes disponibles de toutes les entreprises</p>
      </div>

      <div className="rounded-2xl bg-brand-700 p-6 text-white">
        <p className="text-brand-100 text-xs flex items-center gap-1.5"><Wallet size={13} /> Solde cumulé plateforme</p>
        <p className="text-3xl font-medium mt-1.5 tabular-nums">{formatXOF(totalBalance)}</p>
      </div>

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

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucune entreprise" icon={Wallet} />
        ) : (
          <div className="divide-y divide-ink-50">
            {filtered.map((c) => (
              <Link key={c.id} href={`/admin/companies/${c.id}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-ink-50/50 transition-colors">
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
    </div>
  );
}
