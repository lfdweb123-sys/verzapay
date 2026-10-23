"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { KycBadge, TxBadge, PayoutBadge, MethodPill, Spinner } from "@/components/ui/badges";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  ArrowLeft, Building2, FileText, Users, Wallet, CreditCard,
  ArrowDownLeft, ArrowUpRight, Shield, Mail, Phone, MapPin,
} from "lucide-react";
import { formatXOF, formatDateTime, initials, colorForName } from "@/lib/utils";
import type { Company, Transaction, Payout, LedgerEntry } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface MemberDetail {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  isOwner: boolean;
}

export default function AdminCompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { show } = useToast();

  const [data, setData] = useState<{
    company: Company;
    members: MemberDetail[];
    transactions: Transaction[];
    payouts: Payout[];
    ledger: LedgerEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "transactions" | "payouts" | "team">("overview");

  const pgTx = usePagination(data?.transactions ?? [], 20);
  const pgPo = usePagination(data?.payouts ?? [], 20);
  const pgMem = usePagination(data?.members ?? [], 20);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/company-detail?uid=${user.uid}&companyId=${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erreur de chargement");
        setData(json);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  if (loading) return <div className="flex justify-center items-center min-h-[40vh]"><Spinner size={28} /></div>;
  if (!data) return null;

  const { company, members, transactions, payouts } = data;
  const legal = company.legalInfo ?? {};

  return (
    <div className="space-y-5">
      <Link href="/admin/companies" className="btn-ghost -ml-1"><ArrowLeft size={16} /> Retour aux entreprises</Link>

      {/* En-tête */}
      <div className="card-base p-5 flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-semibold shrink-0"
            style={{ background: company.logoColor ?? colorForName(company.name) }}
          >
            {initials(company.name)}
          </div>
          <div>
            <p className="text-lg font-medium text-ink-900 flex items-center gap-2">
              {company.name}
              {company.suspended && <span className="badge bg-danger-50 text-danger-700">Suspendue</span>}
            </p>
            <p className="text-sm text-ink-500">{company.legalName ?? "—"} · {company.country}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-ink-500">Statut KYC</p>
            <div className="mt-1"><KycBadge status={company.kycStatus} /></div>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-500">Solde disponible</p>
            <p className="font-medium tabular-nums">{formatXOF(company.walletBalance ?? 0)}</p>
          </div>
        </div>
      </div>

      {company.suspended && company.suspendedReason && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-900">
          <strong>Motif de suspension :</strong> {company.suspendedReason}
        </div>
      )}

      {/* Onglets */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-ink-200">
        {[
          { id: "overview" as const, label: "Vue d'ensemble", icon: Building2 },
          { id: "transactions" as const, label: "Transactions", icon: ArrowDownLeft },
          { id: "payouts" as const, label: "Retraits", icon: ArrowUpRight },
          { id: "team" as const, label: "Équipe", icon: Users },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-brand-700 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* Vue d'ensemble */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="card-base p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <FileText size={18} className="text-brand-700" />
              <p className="font-medium text-ink-900">Informations légales</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-ink-500">Numéro IFU</p><p className="font-mono mt-0.5">{legal.ifuNumber || "—"}</p></div>
              <div><p className="text-xs text-ink-500">Numéro RCCM</p><p className="font-mono mt-0.5">{legal.rccmNumber || "—"}</p></div>
              <div><p className="text-xs text-ink-500">Catégorie</p><p className="mt-0.5">{legal.legalCategory || "—"}</p></div>
              <div><p className="text-xs text-ink-500">Régime fiscal</p><p className="mt-0.5">{legal.taxRegime || "—"}</p></div>
              <div className="sm:col-span-2"><p className="text-xs text-ink-500 flex items-center gap-1"><MapPin size={11} /> Adresse</p><p className="mt-0.5">{legal.address || "—"}</p></div>
              <div className="sm:col-span-2"><p className="text-xs text-ink-500">Activité déclarée</p><p className="mt-0.5">{legal.activityDescription || "—"}</p></div>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card-base p-4">
              <p className="text-xs text-ink-500">Commission</p>
              <p className="text-lg font-medium mt-1">{(company.commissionRate * 100).toFixed(1)}%</p>
            </div>
            <div className="card-base p-4">
              <p className="text-xs text-ink-500">Secteur</p>
              <p className="text-lg font-medium mt-1">{company.sector || "—"}</p>
            </div>
            <div className="card-base p-4">
              <p className="text-xs text-ink-500">Clé API générée</p>
              <p className="text-lg font-medium mt-1">{company.apiKeySecretGenerated ? "Oui" : "Non"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Transactions */}
      {tab === "transactions" && (
        <div className="card-base overflow-hidden">
          {transactions.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-12">Aucune transaction</p>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {pgTx.pageItems.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-4 py-3"><p className="font-medium">{tx.customerName ?? "—"}</p><p className="text-xs text-ink-500">{tx.customerPhone}</p></td>
                      <td className="px-4 py-3"><MethodPill method={tx.method} /></td>
                      <td className="px-4 py-3"><TxBadge status={tx.status} /></td>
                      <td className="px-4 py-3 text-xs text-ink-500">{formatDateTime(tx.createdAt)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatXOF(tx.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={pgTx.page} pageCount={pgTx.pageCount} total={pgTx.total} onChange={pgTx.setPage} />
        </div>
      )}

      {/* Payouts */}
      {tab === "payouts" && (
        <div className="card-base overflow-hidden">
          {payouts.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-12">Aucun retrait</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Bénéficiaire</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Statut</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Date</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {pgPo.pageItems.map((po) => (
                    <tr key={po.id}>
                      <td className="px-4 py-3"><p className="font-medium">{po.recipientName ?? "—"}</p><p className="text-xs text-ink-500">{po.recipientPhone}</p></td>
                      <td className="px-4 py-3"><PayoutBadge status={po.status} /></td>
                      <td className="px-4 py-3 text-xs text-ink-500">{formatDateTime(po.createdAt)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-danger-700">-{formatXOF(po.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={pgPo.page} pageCount={pgPo.pageCount} total={pgPo.total} onChange={pgPo.setPage} />
        </div>
      )}

      {/* Équipe */}
      {tab === "team" && (
        <>
        <div className="card-base overflow-hidden divide-y divide-ink-50">
          {pgMem.pageItems.map((m) => (
            <div key={m.uid} className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <UserAvatar photoURL={m.photoURL} name={m.displayName} size={36} />
                <div>
                  <p className="text-sm font-medium text-ink-900">{m.displayName}</p>
                  <p className="text-xs text-ink-500 flex items-center gap-1"><Mail size={11} /> {m.email}</p>
                </div>
              </div>
              <span className={`badge ${m.isOwner ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-700"}`}>
                <Shield size={11} /> {m.isOwner ? "Propriétaire" : "Membre"}
              </span>
            </div>
          ))}
        </div>
        <Pagination page={pgMem.page} pageCount={pgMem.pageCount} total={pgMem.total} onChange={pgMem.setPage} />
        </>
      )}
    </div>
  );
}
