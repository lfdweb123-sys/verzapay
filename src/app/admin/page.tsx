"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/badges";
import {
  Building2, AlertTriangle, CheckCircle2, TrendingUp, ArrowRight,
  ShieldAlert, Wallet, Percent, Activity,
} from "lucide-react";
import { formatXOF } from "@/lib/utils";

interface AdminStats {
  totalCompanies: number;
  approvedCompanies: number;
  pendingKyc: number;
  suspendedCompanies: number;
  totalWalletBalance: number;
  totalVolume30d: number;
  totalCommission30d: number;
  successRate: number;
  transactionsCount30d: number;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/stats?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur de chargement");
        setStats(data);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) return <div className="flex justify-center items-center min-h-[40vh]"><Spinner size={28} /></div>;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Tableau de bord administration</h1>
        <p className="text-sm text-ink-500">Vue globale de la plateforme Verzapay</p>
      </div>

      {/* Alerte KYC en attente */}
      {stats.pendingKyc > 0 && (
        <Link
          href="/admin/companies?filter=pending"
          className="flex items-center justify-between gap-3 rounded-xl border border-warning-500/30 bg-warning-50 px-4 py-3.5 hover:bg-warning-100/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-warning-700 shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning-900">{stats.pendingKyc} dossier(s) KYC en attente de révision</p>
              <p className="text-xs text-warning-700">Cliquez pour examiner les demandes.</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-warning-700 shrink-0" />
        </Link>
      )}

      {/* Stats principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><Building2 size={12} /> Entreprises totales</p>
          <p className="text-2xl font-medium mt-1.5 tabular-nums">{stats.totalCompanies}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><CheckCircle2 size={12} /> Vérifiées</p>
          <p className="text-2xl font-medium mt-1.5 tabular-nums text-success-700">{stats.approvedCompanies}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><AlertTriangle size={12} /> KYC en attente</p>
          <p className="text-2xl font-medium mt-1.5 tabular-nums text-warning-700">{stats.pendingKyc}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><ShieldAlert size={12} /> Suspendues</p>
          <p className="text-2xl font-medium mt-1.5 tabular-nums text-danger-700">{stats.suspendedCompanies}</p>
        </div>
      </div>

      {/* Stats financières */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card-base p-5">
          <p className="text-xs text-ink-500 flex items-center gap-1.5"><Wallet size={13} /> Solde cumulé marchands</p>
          <p className="text-xl font-medium mt-2 tabular-nums">{formatXOF(stats.totalWalletBalance)}</p>
        </div>
        <div className="card-base p-5">
          <p className="text-xs text-ink-500 flex items-center gap-1.5"><TrendingUp size={13} /> Volume (30 jours)</p>
          <p className="text-xl font-medium mt-2 tabular-nums">{formatXOF(stats.totalVolume30d)}</p>
          <p className="text-xs text-ink-400 mt-1">{stats.transactionsCount30d} transactions</p>
        </div>
        <div className="card-base p-5">
          <p className="text-xs text-ink-500 flex items-center gap-1.5"><Percent size={13} /> Commission perçue (30j)</p>
          <p className="text-xl font-medium mt-2 tabular-nums text-brand-700">{formatXOF(stats.totalCommission30d)}</p>
        </div>
      </div>

      <div className="card-base p-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Activity size={18} className="text-brand-700" />
          <div>
            <p className="text-sm font-medium text-ink-900">Taux de succès global (30 jours)</p>
            <p className="text-xs text-ink-500">Tous marchands confondus</p>
          </div>
        </div>
        <p className="text-2xl font-medium tabular-nums">{stats.successRate}%</p>
      </div>

      {/* Liens rapides */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/admin/companies" className="card-base p-4 flex items-center justify-between hover:border-brand-300 transition-colors">
          <span className="text-sm font-medium text-ink-900">Gérer les entreprises</span>
          <ArrowRight size={15} className="text-ink-400" />
        </Link>
        <Link href="/admin/transactions" className="card-base p-4 flex items-center justify-between hover:border-brand-300 transition-colors">
          <span className="text-sm font-medium text-ink-900">Voir toutes les transactions</span>
          <ArrowRight size={15} className="text-ink-400" />
        </Link>
      </div>
    </div>
  );
}
