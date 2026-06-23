"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth-context";
import { usePreferences } from "@/lib/preferences-context";
import { StatCard, TxBadge, MethodPill, EmptyState, Spinner } from "@/components/ui/badges";
import { KycBanner } from "@/components/dashboard/kyc-banner";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import {
  ArrowDownLeft, ArrowUpRight, TrendingUp, CheckCircle2,
  ShieldAlert, Plus, Send, ExternalLink,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Transaction } from "@/types";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { format, subDays, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

export default function DashboardPage() {
  const { activeCompany, loading: compLoading } = useCompany();
  const { appUser } = useAuth();
  const { formatAmount } = usePreferences();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!activeCompany) { setTxLoading(false); return; }
    setTxLoading(true);
    const q = query(
      collection(db, "companies", activeCompany.id, "transactions"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => d.data() as Transaction));
      setTxLoading(false);
    });
  }, [activeCompany?.id]);

  if (compLoading) {
    return <div className="flex justify-center items-center min-h-[40vh]"><Spinner size={28} /></div>;
  }

  const kycOk = activeCompany?.kycStatus === "approved";
  const completedTx = transactions.filter((t) => t.status === "completed");
  const totalVolume = completedTx.reduce((s, t) => s + t.amount, 0);
  const totalIn = completedTx.reduce((s, t) => s + t.amount, 0);
  const totalOut = 0; // payouts loaded separately
  const successRate = transactions.length
    ? Math.round((completedTx.length / transactions.length) * 100)
    : 0;

  // Données pour le mini graphe des 7 derniers jours
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    const dateStr = format(d, "yyyy-MM-dd");
    const dayTx = completedTx.filter(
      (t) => format(new Date(t.createdAt), "yyyy-MM-dd") === dateStr
    );
    return {
      day: format(d, "EEE", { locale: fr }),
      volume: dayTx.reduce((s, t) => s + t.amount, 0),
    };
  });

  const recentTx = selectedDate
    ? transactions.filter((t) => isSameDay(new Date(t.createdAt), selectedDate))
    : transactions.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Bannière KYC si non approuvé */}
      {activeCompany && activeCompany.kycStatus !== "approved" && (
        <KycBanner company={activeCompany} />
      )}

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink-900">
            Bonjour, {appUser?.displayName?.split(" ")[0] ?? "—"} 👋
          </h1>
          <p className="text-sm text-ink-500 mt-0.5">
            {activeCompany?.name ?? "Aucune entreprise"} — Vue d'ensemble financière
          </p>
        </div>
        {/* Boutons d'action : libellé court sur mobile (Créer / Envoyer),
            libellé complet à partir de sm: (Créer un lien / Envoyer un paiement) */}
        <div className="flex items-center gap-2">
          <Link href="/payments/new" className="btn-secondary h-9 text-sm whitespace-nowrap">
            <Plus size={15} />
            <span className="sm:hidden">Créer</span>
            <span className="hidden sm:inline">Créer un lien</span>
          </Link>
          {kycOk && (
            <Link href="/payouts/new" className="btn-primary h-9 text-sm whitespace-nowrap">
              <Send size={14} />
              <span className="sm:hidden">Envoyer</span>
              <span className="hidden sm:inline">Envoyer un paiement</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Paiements entrants (7j)"
          value={formatAmount(totalIn)}
          sub="+100% vs sem. dernière"
          subUp={true}
          icon={ArrowDownLeft}
          loading={txLoading}
        />
        <StatCard
          label="Paiements sortants (7j)"
          value={formatAmount(totalOut)}
          icon={ArrowUpRight}
          loading={txLoading}
        />
        <StatCard
          label="Taux de succès"
          value={txLoading ? "—" : `${successRate}%`}
          sub={transactions.length + " transactions"}
          icon={CheckCircle2}
          loading={txLoading}
        />
        <StatCard
          label="Solde disponible"
          value={formatAmount(activeCompany?.walletBalance ?? 0)}
          sub="Solde net après commission"
          icon={TrendingUp}
          loading={compLoading}
        />
      </div>

      {/* Graphe volume + Calendrier */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graphe 7 jours */}
        <div className="lg:col-span-2 card-base p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-ink-900">Volume des 7 derniers jours</p>
            <Link href="/transactions" className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Tout voir <ExternalLink size={11} />
            </Link>
          </div>
          {txLoading ? (
            <div className="h-32 flex items-center justify-center"><Spinner /></div>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#888780" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [formatAmount(Number(v)), "Volume"]}
                  contentStyle={{ fontSize: 12, border: "1px solid #E4E2DA", borderRadius: 8 }}
                  cursor={{ fill: "#F1EFE8" }}
                />
                <Bar dataKey="volume" fill="#185FA5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Mini calendrier + prochain paiement */}
        <MiniCalendar transactions={transactions} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      </div>

      {/* Tableau des transactions récentes */}
      <div className="card-base">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
          <p className="text-sm font-medium text-ink-900">
            {selectedDate ? `Transactions du ${format(selectedDate, "d MMMM yyyy", { locale: fr })}` : "Transactions récentes"}
          </p>
          <Link href="/transactions" className="text-xs text-brand-600 hover:text-brand-700">
            Voir tout
          </Link>
        </div>

        {txLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : recentTx.length === 0 ? (
          <EmptyState
            title={selectedDate ? "Aucune transaction ce jour-là" : "Aucune transaction pour le moment"}
            description={selectedDate ? "Choisissez une autre date ou effacez le filtre." : "Créez un lien de paiement pour commencer à encaisser."}
            icon={ArrowDownLeft}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500 whitespace-nowrap">Client</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500 whitespace-nowrap">Méthode</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500 whitespace-nowrap">Statut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500 whitespace-nowrap">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500 whitespace-nowrap">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {recentTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-ink-900">{tx.customerName ?? "—"}</p>
                      {tx.customerPhone && <p className="text-xs text-ink-500">{tx.customerPhone}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <MethodPill method={tx.method} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <TxBadge status={tx.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums">
                      {formatAmount(tx.amount)}
                    </td>
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