import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { TransactionStatus, PayoutStatus, KycStatus } from "@/types";

// ─── Badge statut transaction ─────────────────────────────────────────────────
const TX_BADGE: Record<TransactionStatus, { label: string; cls: string }> = {
  completed: { label: "Complété", cls: "bg-success-50 text-success-900" },
  pending:   { label: "En attente", cls: "bg-warning-50 text-warning-900" },
  processing:{ label: "En cours", cls: "bg-brand-50 text-brand-900" },
  failed:    { label: "Échoué", cls: "bg-danger-50 text-danger-900" },
  cancelled: { label: "Annulé", cls: "bg-ink-100 text-ink-700" },
  expired:   { label: "Expiré", cls: "bg-ink-100 text-ink-600" },
};

export function TxBadge({ status }: { status: TransactionStatus }) {
  const cfg = TX_BADGE[status] ?? { label: status, cls: "bg-ink-100 text-ink-700" };
  return <span className={cn("badge", cfg.cls)}>{cfg.label}</span>;
}

// ─── Badge statut payout ──────────────────────────────────────────────────────
const PO_BADGE: Record<PayoutStatus, { label: string; cls: string }> = {
  completed:  { label: "Complété", cls: "bg-success-50 text-success-900" },
  pending:    { label: "En attente", cls: "bg-warning-50 text-warning-900" },
  processing: { label: "En cours", cls: "bg-brand-50 text-brand-900" },
  failed:     { label: "Échoué", cls: "bg-danger-50 text-danger-900" },
  rejected:   { label: "Refusé", cls: "bg-danger-50 text-danger-700" },
};

export function PayoutBadge({ status }: { status: PayoutStatus }) {
  const cfg = PO_BADGE[status] ?? { label: status, cls: "bg-ink-100 text-ink-700" };
  return <span className={cn("badge", cfg.cls)}>{cfg.label}</span>;
}

// ─── Badge statut KYC ────────────────────────────────────────────────────────
const KYC_BADGE: Record<KycStatus, { label: string; cls: string }> = {
  not_started: { label: "Non commencé", cls: "bg-ink-100 text-ink-600" },
  awaiting_submission: { label: "Documents à soumettre", cls: "bg-warning-50 text-warning-900" },
  pending:     { label: "En attente", cls: "bg-warning-50 text-warning-900" },
  review:      { label: "En révision", cls: "bg-brand-50 text-brand-900" },
  approved:    { label: "Approuvé", cls: "bg-success-50 text-success-900" },
  rejected:    { label: "Rejeté", cls: "bg-danger-50 text-danger-900" },
};

export function KycBadge({ status }: { status: KycStatus }) {
  const cfg = KYC_BADGE[status] ?? { label: status, cls: "bg-ink-100 text-ink-700" };
  return <span className={cn("badge", cfg.cls)}>{cfg.label}</span>;
}

// ─── Carte stat ───────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  subUp?: boolean;
  icon?: React.ElementType;
  loading?: boolean;
}

export function StatCard({ label, value, sub, subUp, icon: Icon, loading }: StatCardProps) {
  return (
    <div className="card-base p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">{label}</p>
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
            <Icon size={14} className="text-brand-700" />
          </div>
        )}
      </div>
      {loading ? (
        <div className="h-7 flex items-center">
          <div className="h-3 w-24 bg-ink-200 animate-pulse rounded" />
        </div>
      ) : (
        <p className="text-xl font-medium text-ink-900 tabular-nums">{value}</p>
      )}
      {sub && (
        <p className={cn("text-xs", subUp == null ? "text-ink-500" : subUp ? "text-success-700" : "text-danger-700")}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ title, description, icon: Icon }: { title: string; description?: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-ink-100 flex items-center justify-center mb-3">
          <Icon size={22} className="text-ink-400" />
        </div>
      )}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {description && <p className="text-sm text-ink-500 mt-1 max-w-xs">{description}</p>}
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-brand-600" />;
}

// ─── Method pill ─────────────────────────────────────────────────────────────
import type { PaymentMethod } from "@/types";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  mobile_money: "Mobile Money",
  card: "Carte bancaire",
  wave: "Wave",
};

export function MethodPill({ method }: { method: PaymentMethod }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-600">
      <span>{method === "card" ? "💳" : "📱"}</span>
      {METHOD_LABELS[method]}
    </span>
  );
}
