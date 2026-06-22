"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { PayoutBadge, EmptyState, Spinner } from "@/components/ui/badges";
import { ArrowUpRight, Search } from "lucide-react";
import { formatXOF, formatDateTime } from "@/lib/utils";
import type { Payout } from "@/types";

type EnrichedPayout = Payout & { companyName: string };

export default function AdminPayoutsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [payouts, setPayouts] = useState<EnrichedPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/payouts?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setPayouts(data.payouts ?? []);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return payouts;
    return payouts.filter(
      (p) => p.companyName?.toLowerCase().includes(q) || p.recipientName?.toLowerCase().includes(q) || p.recipientPhone?.includes(q)
    );
  }, [payouts, search]);

  const totalOut = filtered.filter((p) => p.status === "completed" || p.status === "processing").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Paiements sortants</h1>
        <p className="text-sm text-ink-500">Tous les retraits effectués par les marchands</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Total décaissé</p>
          <p className="text-xl font-medium mt-1 tabular-nums text-danger-700">{formatXOF(totalOut)}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Retraits affichés</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{filtered.length}</p>
        </div>
      </div>

      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher par entreprise, bénéficiaire…"
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
          <EmptyState title="Aucun retrait" icon={ArrowUpRight} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Marchand</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Bénéficiaire</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Statut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {filtered.map((po) => (
                  <tr key={po.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-brand-800">{po.companyName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-ink-900">{po.recipientName ?? "—"}</p>
                      <p className="text-xs text-ink-500">{po.recipientPhone}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><PayoutBadge status={po.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{formatDateTime(po.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums text-danger-700">-{formatXOF(po.amount)}</td>
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
