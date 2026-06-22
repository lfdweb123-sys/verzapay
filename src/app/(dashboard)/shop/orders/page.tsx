"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { Spinner, EmptyState } from "@/components/ui/badges";
import { formatXOF, formatDateTime, cn } from "@/lib/utils";
import type { ShopOrder, ShopOrderStatus } from "@/types";

const STATUS_LABELS: Record<ShopOrderStatus, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-warning-50 text-warning-900" },
  paid: { label: "Payée", cls: "bg-success-50 text-success-900" },
  fulfilled: { label: "Livrée", cls: "bg-brand-50 text-brand-900" },
  cancelled: { label: "Annulée", cls: "bg-ink-100 text-ink-600" },
};

export default function ShopOrdersPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activeCompany) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/shop/mine?uid=${user.uid}&companyId=${activeCompany.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setOrders(data.orders ?? []);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, activeCompany?.id]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/shop" className="btn-ghost -ml-1"><ArrowLeft size={16} /></Link>
        <h1 className="text-lg font-medium text-ink-900">Commandes de la boutique</h1>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : orders.length === 0 ? (
          <EmptyState title="Aucune commande" description="Les commandes de vos clients apparaîtront ici." icon={ShoppingBag} />
        ) : (
          <div className="divide-y divide-ink-50">
            {orders.map((o) => {
              const cfg = STATUS_LABELS[o.status];
              return (
                <div key={o.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{o.customerName}</p>
                      <p className="text-xs text-ink-500">{o.customerPhone} · {formatDateTime(o.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("badge", cfg.cls)}>{cfg.label}</span>
                      <p className="text-sm font-medium tabular-nums">{formatXOF(o.totalAmount)}</p>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-ink-500 space-y-0.5">
                    {o.items.map((item, i) => (
                      <p key={i}>{item.quantity} × {item.productName} — {formatXOF(item.unitPrice * item.quantity)}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
