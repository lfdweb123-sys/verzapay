"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Copy, CheckCircle2, BookOpen, Webhook, ArrowRight, Loader2, Save,
} from "lucide-react";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://verzapay.com";
const API_BASE_URL = `${APP_BASE_URL}/api/v1`;

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
      <button onClick={copy} className="absolute top-2 right-2 w-7 h-7 rounded-md bg-ink-700 hover:bg-ink-600 flex items-center justify-center transition-colors">
        {copied ? <CheckCircle2 size={13} className="text-success-50" /> : <Copy size={13} className="text-ink-300" />}
      </button>
    </div>
  );
}

export default function DevelopersPage() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { show } = useToast();

  const [webhookUrl, setWebhookUrl] = useState(activeCompany?.webhookUrl ?? "");
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Resynchronise le champ si l'entreprise active change (ex: switch d'entreprise).
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

      {/* Clé API — génération one-time */}
      <ApiKeyManager company={activeCompany} />

      {/* Référence rapide */}
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

      {/* URL Webhook du marchand */}
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
            { event: "payment.failed", desc: "Paiement échoué" },
            { event: "payout.completed", desc: "Décaissement effectué" },
            { event: "payout.failed", desc: "Décaissement échoué" },
          ].map((e) => (
            <div key={e.event} className="flex items-center gap-3 p-2 rounded-lg hover:bg-ink-50">
              <code className="text-xs font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{e.event}</code>
              <span className="text-ink-600">{e.desc}</span>
            </div>
          ))}
        </div>

        <CodeBlock label="Exemple de handler webhook (Node.js)" code={exampleWebhook} />
      </div>
    </div>
  );
}