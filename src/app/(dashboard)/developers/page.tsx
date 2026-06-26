"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { doc, updateDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Copy, CheckCircle2, BookOpen, Webhook, ArrowRight, Loader2, Save,
  XCircle, Clock, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://verzapay.com";
const API_BASE_URL = `${APP_BASE_URL}/api/v1`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookLog {
  id: string;
  type: string;
  paymentId?: string;
  amount?: number;
  status: string;
  sentAt: number;
  responseStatus?: number;
  success: boolean;
  payload?: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const { show } = useToast();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    show("Copié !", "success");
  }

  return (
    <div className="relative">
      {label && <p className="text-xs text-ink-500 mb-1.5">{label}</p>}
      <div className="bg-ink-900 rounded-lg p-3.5 font-mono text-sm text-ink-100 overflow-x-auto">
        <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed">{code}</pre>
      </div>
      <button
        onClick={copy}
        className="absolute top-2 right-2 w-7 h-7 rounded-md bg-ink-700 hover:bg-ink-600 flex items-center justify-center transition-colors"
      >
        {copied ? <CheckCircle2 size={13} className="text-success-50" /> : <Copy size={13} className="text-ink-300" />}
      </button>
    </div>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    "payment.completed": "bg-success-50 text-success-700",
    "payment.failed":    "bg-error-50 text-error-700",
    "payout.completed":  "bg-brand-50 text-brand-700",
    "payout.failed":     "bg-warning-50 text-warning-700",
  };
  return (
    <code className={`text-xs font-mono px-2 py-0.5 rounded ${colors[type] ?? "bg-ink-100 text-ink-600"}`}>
      {type}
    </code>
  );
}

function WebhookLogRow({ log }: { log: WebhookLog }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-50 transition-colors text-left"
      >
        {/* Status icon */}
        {log.success
          ? <CheckCircle2 size={15} className="text-success-600 shrink-0" />
          : <XCircle size={15} className="text-error-600 shrink-0" />}

        {/* Event type */}
        <EventTypeBadge type={log.type} />

        {/* Amount */}
        {log.amount != null && (
          <span className="text-sm text-ink-700 font-medium">
            {log.amount.toLocaleString("fr-FR")} XOF
          </span>
        )}

        {/* paymentId */}
        {log.paymentId && (
          <span className="text-xs text-ink-400 font-mono hidden sm:block truncate max-w-[120px]">
            {log.paymentId}
          </span>
        )}

        {/* HTTP status */}
        {log.responseStatus != null && (
          <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${
            log.responseStatus >= 200 && log.responseStatus < 300
              ? "bg-success-50 text-success-700"
              : "bg-error-50 text-error-700"
          }`}>
            HTTP {log.responseStatus}
          </span>
        )}

        {/* Date */}
        <span className="text-xs text-ink-400 shrink-0 ml-2">
          {new Date(log.sentAt).toLocaleString("fr-FR", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </span>

        {open ? <ChevronUp size={14} className="text-ink-400 shrink-0" /> : <ChevronDown size={14} className="text-ink-400 shrink-0" />}
      </button>

      {open && log.payload && (
        <div className="border-t border-ink-100 px-4 py-3 bg-ink-50">
          <p className="text-xs text-ink-500 mb-2">Payload envoyé</p>
          <pre className="text-xs font-mono text-ink-700 whitespace-pre-wrap break-all leading-relaxed">
            {JSON.stringify(log.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Webhook Logs Section ─────────────────────────────────────────────────────

function WebhookLogs({ companyId }: { companyId: string }) {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchLogs(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const ref = collection(db, "companies", companyId, "webhookLogs");
      const q = query(ref, orderBy("sentAt", "desc"), limit(50));
      const snap = await getDocs(q);
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WebhookLog)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchLogs(); }, [companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-ink-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Chargement des logs…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">
          {logs.length === 0 ? "Aucun webhook envoyé pour le moment." : `${logs.length} dernier${logs.length > 1 ? "s" : ""} appel${logs.length > 1 ? "s" : ""}`}
        </p>
        <button
          onClick={() => fetchLogs(true)}
          disabled={refreshing}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Rafraîchir
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center bg-ink-50 rounded-xl">
          <Clock size={28} className="text-ink-300" />
          <p className="text-sm text-ink-500 max-w-xs">
            Les appels webhook apparaîtront ici dès qu&apos;un événement de paiement sera déclenché.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => <WebhookLogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevelopersPage() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { show } = useToast();

  const [webhookUrl, setWebhookUrl] = useState(activeCompany?.webhookUrl ?? "");
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => {
    setWebhookUrl(activeCompany?.webhookUrl ?? "");
  }, [activeCompany?.id, activeCompany?.webhookUrl]);

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany || !user) return;
    if (webhookUrl && !webhookUrl.startsWith("https://")) {
      show("L'URL doit commencer par https://", "error");
      return;
    }
    setSavingWebhook(true);
    try {
      await updateDoc(doc(db, "companies", activeCompany.id), { webhookUrl: webhookUrl || null });
      show("URL webhook sauvegardée", "success");
    } catch {
      show("Erreur lors de la sauvegarde", "error");
    } finally {
      setSavingWebhook(false);
    }
  }

  const examplePayment = `curl -X POST ${API_BASE_URL}/payments \\
  -H "Authorization: Bearer vpz_sk_votre_cle" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25000,
    "currency": "XOF",
    "description": "Commande #1234",
    "customer_name": "Kofi Mensah",
    "customer_phone": "+22996000000"
  }'`;

  const exampleWebhook = `// Votre endpoint webhook (POST /webhook/verzapay)
app.post('/webhook/verzapay', (req, res) => {
  const event = req.body;
  // event.type            : "payment.completed" | "payment.failed" | "payout.completed" | "payout.failed"
  // event.paymentId       : identifiant Verzapay de la transaction
  // event.amount          : montant en XOF
  // event.status          : "completed" | "failed"
  // event.merchantReference (si fourni à la création via l'API)

  switch (event.type) {
    case 'payment.completed':
      // Activer la commande, envoyer un reçu...
      break;
    case 'payment.failed':
      // Notifier l'utilisateur...
      break;
    case 'payout.completed':
      // Marquer le retrait comme traité
      break;
    case 'payout.failed':
      // Le solde a déjà été recrédité automatiquement côté Verzapay
      break;
  }
  res.status(200).json({ received: true });
});`;

  if (!activeCompany) {
    return (
      <div className="card-base p-8 text-center">
        <p className="text-sm text-ink-500">Créez ou sélectionnez une entreprise pour accéder à l&apos;espace développeur.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Espace Développeur</h1>
          <p className="text-sm text-ink-500 mt-1">Intégrez Verzapay dans votre application via notre API — {activeCompany.name}</p>
        </div>
        <Link href="/docs" target="_blank" className="btn-secondary text-sm">
          <BookOpen size={15} />
          Documentation complète
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Clé API */}
      <ApiKeyManager company={activeCompany} />

      {/* Démarrage rapide */}
      <div className="card-base p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <BookOpen size={18} className="text-brand-700" />
          <p className="font-medium text-ink-900">Démarrage rapide</p>
        </div>
        <CodeBlock label="URL de base" code={API_BASE_URL} />
        <CodeBlock label="Créer un paiement (encaissement)" code={examplePayment} />
        <Link href="/docs#payments" className="inline-flex items-center gap-1 text-sm text-brand-600 font-medium hover:text-brand-700">
          Voir la référence complète <ArrowRight size={14} />
        </Link>
      </div>

      {/* URL Webhook */}
      <div className="card-base p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Webhook size={18} className="text-brand-700" />
          <p className="font-medium text-ink-900">URL Webhook</p>
        </div>
        <p className="text-sm text-ink-600">
          Verzapay enverra une requête POST à cette URL à chaque événement de paiement (paiement reçu, échoué, retrait effectué…). Laissez vide si vous ne souhaitez pas recevoir de notifications.
        </p>

        <form onSubmit={saveWebhook} className="flex gap-2">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://votresite.com/webhook/verzapay"
            className="input-base flex-1"
          />
          <button type="submit" disabled={savingWebhook} className="btn-secondary shrink-0">
            {savingWebhook ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Sauvegarder
          </button>
        </form>

        {activeCompany.webhookUrl && (
          <div className="flex items-center gap-2 text-xs text-success-700 bg-success-50 rounded-lg px-3 py-2">
            <CheckCircle2 size={13} /> Webhook actif — Verzapay notifiera <strong>{activeCompany.webhookUrl}</strong>
          </div>
        )}

        <div className="bg-ink-50 rounded-lg p-3 text-xs text-ink-500">
          L&apos;URL doit être en <code className="font-mono">https://</code> et accessible publiquement. Verzapay enverra un POST avec un body JSON contenant <code className="font-mono">type</code>, <code className="font-mono">paymentId</code>, <code className="font-mono">amount</code> et <code className="font-mono">status</code>.
        </div>

        <div className="space-y-1.5 text-sm">
          {[
            { event: "payment.completed", desc: "Paiement reçu avec succès" },
            { event: "payment.failed",    desc: "Paiement échoué" },
            { event: "payout.completed",  desc: "Décaissement effectué" },
            { event: "payout.failed",     desc: "Décaissement échoué" },
          ].map((e) => (
            <div key={e.event} className="flex items-center gap-3 p-2 rounded-lg hover:bg-ink-50">
              <code className="text-xs font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{e.event}</code>
              <span className="text-ink-600">{e.desc}</span>
            </div>
          ))}
        </div>

        <CodeBlock label="Exemple de handler webhook (Node.js)" code={exampleWebhook} />
      </div>

      {/* ── Historique des appels webhook ─────────────────────────────────── */}
      <div className="card-base p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Clock size={18} className="text-brand-700" />
          <p className="font-medium text-ink-900">Historique des appels webhook</p>
        </div>
        <p className="text-sm text-ink-600">
          Les 50 derniers appels envoyés par Verzapay à votre endpoint. Cliquez sur une ligne pour voir le payload complet.
        </p>
        <WebhookLogs companyId={activeCompany.id} />
      </div>
    </div>
  );
}