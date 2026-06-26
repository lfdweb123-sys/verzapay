"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/badges";
import {
  RefreshCw, Clock, Phone, User, Hash, AlertCircle,
} from "lucide-react";
import { formatXOF } from "@/lib/utils";

interface ReconciledItem {
  id: string;
  companyId: string;
  companyName: string;
  amount: number;
  netAmount: number;
  currency: string;
  customerName: string | null;
  customerPhone: string | null;
  joonapayPaymentId: string | null;
  createdAt: number;
  completedAt: number;
  delayMs: number | null;
}

function formatDelay(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DAYS_OPTIONS = [
  { label: "7 jours", value: 7 },
  { label: "30 jours", value: 30 },
  { label: "90 jours", value: 90 },
];

export default function AdminReconciledPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [items, setItems] = useState<ReconciledItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reconciled?uid=${user.uid}&days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de chargement");
      setItems(data.items);
      setTotalAmount(data.totalAmount);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [user, days, show]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink-900 flex items-center gap-2">
            <RefreshCw size={18} className="text-brand-700" />
            Paiements débloqués automatiquement
          </h1>
          <p className="text-sm text-ink-500">
            Transactions confirmées par réconciliation directe avec JoonaPay (webhook jamais reçu)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                days === opt.value
                  ? "bg-brand-700 text-white border-brand-700"
                  : "border-ink-200 text-ink-600 hover:border-brand-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerte explicative */}
      <div className="flex items-start gap-3 rounded-xl border border-warning-500/30 bg-warning-50 px-4 py-3.5">
        <AlertCircle size={18} className="text-warning-700 shrink-0 mt-0.5" />
        <p className="text-sm text-warning-900">
          Ces paiements ont été marqués <strong>completed</strong> par notre job de réconciliation (cron toutes les 5 min),
          car JoonaPay n&apos;a jamais envoyé le webhook correspondant. Un volume élevé ici indique un problème
          côté infrastructure webhook de JoonaPay à signaler à leur support.
        </p>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Nombre de paiements débloqués</p>
          <p className="text-2xl font-medium mt-1.5 tabular-nums">{loading ? "—" : items.length}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Montant total concerné</p>
          <p className="text-2xl font-medium mt-1.5 tabular-nums">{loading ? "—" : formatXOF(totalAmount)}</p>
        </div>
        <div className="card-base p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-ink-500">Période</p>
          <p className="text-2xl font-medium mt-1.5 tabular-nums">{days} jours</p>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center items-center min-h-[30vh]"><Spinner size={28} /></div>
      ) : items.length === 0 ? (
        <div className="card-base p-8 text-center text-sm text-ink-500">
          Aucun paiement débloqué manuellement sur cette période. 🎉
        </div>
      ) : (
        <div className="card-base divide-y divide-ink-100">
          {items.map((item) => (
            <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-ink-900">{item.companyName}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                    Débloqué auto
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-ink-500 flex-wrap">
                  {item.customerName && (
                    <span className="flex items-center gap-1"><User size={11} /> {item.customerName}</span>
                  )}
                  {item.customerPhone && (
                    <span className="flex items-center gap-1"><Phone size={11} /> {item.customerPhone}</span>
                  )}
                  {item.joonapayPaymentId && (
                    <span className="flex items-center gap-1 font-mono">
                      <Hash size={11} /> {item.joonapayPaymentId.slice(0, 8)}…
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums text-ink-900">
                    {formatXOF(item.amount)} {item.currency !== "XOF" ? item.currency : ""}
                  </p>
                  <p className="text-xs text-ink-400 flex items-center gap-1 justify-end mt-0.5">
                    <Clock size={11} /> Bloqué {formatDelay(item.delayMs)}
                  </p>
                </div>
                <p className="text-xs text-ink-400 tabular-nums whitespace-nowrap">
                  {formatDate(item.completedAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}