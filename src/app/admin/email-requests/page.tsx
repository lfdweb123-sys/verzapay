"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/badges";
import { Mail, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface EmailRequest {
  uid: string;
  displayName: string;
  currentEmail: string;
  pendingEmail: string;
  requestedAt: number;
}

export default function AdminEmailRequestsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [requests, setRequests] = useState<EmailRequest[]>([]);
  const pg = usePagination(requests, 20);
  const [loading, setLoading] = useState(true);
  const [processingUid, setProcessingUid] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/email-requests?uid=${user.uid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setRequests(data.requests ?? []);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  async function handleDecision(targetUid: string, decision: "approve" | "reject") {
    if (!user) return;
    setProcessingUid(targetUid);
    try {
      const res = await fetch("/api/admin/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUid: user.uid, targetUid, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      show(decision === "approve" ? "Email mis à jour" : "Demande refusée", "success");
      await load();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setProcessingUid(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Demandes de changement d&apos;email</h1>
        <p className="text-sm text-ink-500">Validez ou refusez les demandes des marchands</p>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : requests.length === 0 ? (
          <EmptyState title="Aucune demande en attente" icon={Mail} />
        ) : (
          <div className="divide-y divide-ink-50">
            {pg.pageItems.map((r) => (
              <div key={r.uid} className="flex items-center justify-between gap-3 px-4 py-3.5 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-ink-900">{r.displayName}</p>
                  <p className="text-xs text-ink-500 flex items-center gap-1.5 mt-0.5">
                    {r.currentEmail} <ArrowRight size={11} /> <strong className="text-ink-700">{r.pendingEmail}</strong>
                  </p>
                  <p className="text-[11px] text-ink-400 mt-0.5">Demandé le {formatDateTime(r.requestedAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDecision(r.uid, "reject")}
                    disabled={processingUid === r.uid}
                    className="w-8 h-8 rounded-lg bg-danger-50 text-danger-700 hover:bg-danger-100 flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Refuser"
                  >
                    <XCircle size={15} />
                  </button>
                  <button
                    onClick={() => handleDecision(r.uid, "approve")}
                    disabled={processingUid === r.uid}
                    className="w-8 h-8 rounded-lg bg-success-50 text-success-700 hover:bg-success-100 flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Approuver"
                  >
                    {processingUid === r.uid ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}
