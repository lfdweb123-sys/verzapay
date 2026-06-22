"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/badges";
import { Users, Search, Phone, Mail, Building2 } from "lucide-react";
import { formatXOF, initials } from "@/lib/utils";

interface AdminCustomer {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  totalSpent: number;
  transactionsCount: number;
  companies: string[];
}

export default function AdminCustomersPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/customers?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setCustomers(data.customers ?? []);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q));
  }, [customers, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Clients / fournisseurs</h1>
        <p className="text-sm text-ink-500">Tous les clients ayant payé un marchand de la plateforme</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Clients uniques</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{customers.length}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Volume total généré</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{formatXOF(customers.reduce((s, c) => s + c.totalSpent, 0))}</p>
        </div>
      </div>

      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher un client…"
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
          <EmptyState title="Aucun client" icon={Users} />
        ) : (
          <div className="divide-y divide-ink-50">
            {filtered.map((c) => (
              <div key={c.key} className="flex items-center justify-between px-4 py-3.5 flex-wrap gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-medium shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{c.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {c.phone && <span className="text-xs text-ink-500 flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                      {c.email && <span className="text-xs text-ink-500 flex items-center gap-1"><Mail size={10} />{c.email}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden sm:flex items-center gap-1 text-xs text-ink-500">
                    <Building2 size={11} /> {c.companies.join(", ")}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{formatXOF(c.totalSpent)}</p>
                    <p className="text-xs text-ink-500">{c.transactionsCount} achat(s)</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
