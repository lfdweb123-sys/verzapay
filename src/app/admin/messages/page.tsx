"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/badges";
import { Send, Mail, Bell, Users, User, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Merchant {
  uid: string;
  displayName: string;
  email: string;
}

export default function AdminMessagesPage() {
  const { user } = useAuth();
  const { show } = useToast();

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(true);

  const [target, setTarget] = useState<"single" | "all">("single");
  const [targetUid, setTargetUid] = useState("");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendPush, setSendPush] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ recipientsCount: number; emailsSent: number; pushSent: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/merchants-list?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setMerchants(data.merchants ?? []);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoadingMerchants(false);
      }
    })();
  }, [user]);

  const filteredMerchants = merchants.filter((m) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  async function handleSend() {
    if (!user) return;
    if (!subject.trim() || !message.trim()) { show("Sujet et message requis", "error"); return; }
    if (target === "single" && !targetUid) { show("Sélectionnez un destinataire", "error"); return; }
    if (!sendEmail && !sendPush) { show("Sélectionnez au moins un canal d'envoi", "error"); return; }

    setSending(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUid: user.uid, target, targetUid: target === "single" ? targetUid : null, subject, message, sendEmail, sendPush }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi");
      setLastResult(data);
      show("Message envoyé avec succès", "success");
      setSubject("");
      setMessage("");
      setConfirmAllOpen(false);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  function handleSendClick() {
    if (target === "all") {
      setConfirmAllOpen(true);
    } else {
      handleSend();
    }
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Messages</h1>
        <p className="text-sm text-ink-500">Envoyez un email et/ou une notification push à vos marchands</p>
      </div>

      <div className="card-base p-5 space-y-4">
        <div>
          <label className="label-base">Destinataire</label>
          <div className="flex gap-2">
            <button
              onClick={() => setTarget("single")}
              className={cn("flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors",
                target === "single" ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50")}
            >
              <User size={15} /> Un marchand
            </button>
            <button
              onClick={() => setTarget("all")}
              className={cn("flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors",
                target === "all" ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50")}
            >
              <Users size={15} /> Tous les marchands
            </button>
          </div>
        </div>

        {target === "single" && (
          <div>
            <label className="label-base">Rechercher un marchand</label>
            {loadingMerchants ? (
              <div className="flex justify-center py-4"><Spinner size={20} /></div>
            ) : (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom ou email…"
                  className="input-base mb-2"
                />
                <div className="max-h-40 overflow-y-auto border border-ink-200 rounded-lg divide-y divide-ink-50">
                  {filteredMerchants.slice(0, 50).map((m) => (
                    <button
                      key={m.uid}
                      onClick={() => setTargetUid(m.uid)}
                      className={cn("w-full text-left px-3 py-2 text-sm hover:bg-ink-50 transition-colors",
                        targetUid === m.uid && "bg-brand-50")}
                    >
                      <p className="font-medium text-ink-900">{m.displayName}</p>
                      <p className="text-xs text-ink-500">{m.email}</p>
                    </button>
                  ))}
                  {filteredMerchants.length === 0 && (
                    <p className="text-sm text-ink-400 text-center py-4">Aucun marchand trouvé</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div>
          <label className="label-base">Sujet</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex : Maintenance prévue ce week-end" className="input-base" />
        </div>

        <div>
          <label className="label-base">Message</label>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
            placeholder="Votre message…" className="input-base h-auto py-2.5 resize-none"
          />
        </div>

        <div>
          <label className="label-base">Canaux d&apos;envoi</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="rounded" />
              <Mail size={14} /> Email
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} className="rounded" />
              <Bell size={14} /> Notification push
            </label>
          </div>
        </div>

        <button onClick={handleSendClick} disabled={sending} className="btn-primary w-full">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          Envoyer le message
        </button>
      </div>

      {lastResult && (
        <div className="card-base p-4 flex items-center gap-3 border-success-200 bg-success-50">
          <CheckCircle2 size={18} className="text-success-700 shrink-0" />
          <p className="text-sm text-success-900">
            Envoyé à {lastResult.recipientsCount} destinataire(s) — {lastResult.emailsSent} email(s), {lastResult.pushSent} notification(s) push.
          </p>
        </div>
      )}

      {confirmAllOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-popover p-6 text-center">
            <p className="font-medium text-ink-900">Envoyer à tous les marchands ?</p>
            <p className="text-sm text-ink-500 mt-2">
              Ce message sera envoyé à <strong>{merchants.length} marchand(s)</strong>. Cette action est irréversible.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmAllOpen(false)} className="btn-secondary flex-1">Annuler</button>
              <button onClick={handleSend} disabled={sending} className="btn-primary flex-1">
                {sending && <Loader2 size={14} className="animate-spin" />}
                Confirmer l&apos;envoi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
