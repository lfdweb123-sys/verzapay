"use client";

import { useState } from "react";
import Link from "next/link";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { Copy, CheckCircle2, BookOpen, Webhook, ArrowRight } from "lucide-react";

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

  const examplePayment = `curl -X POST https://verzapay.com/api/v1/payments \\
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
  
  switch (event.type) {
    case 'payment.completed':
      // Activer la commande
      break;
    case 'payment.failed':
      // Notifier l'utilisateur
      break;
    case 'payout.completed':
      // Marquer le retrait comme traité
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
        <CodeBlock label="URL de base" code="https://verzapay.com/api/v1" />
        <CodeBlock label="Créer un paiement (encaissement)" code={examplePayment} />
        <Link href="/docs#payments" className="inline-flex items-center gap-1 text-sm text-brand-600 font-medium hover:text-brand-700">
          Voir la référence complète <ArrowRight size={14} />
        </Link>
      </div>

      {/* Webhooks */}
      <div className="card-base p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <Webhook size={18} className="text-brand-700" />
          <p className="font-medium text-ink-900">Webhooks</p>
        </div>
        <p className="text-sm text-ink-600">Configurez votre URL de webhook pour recevoir les notifications en temps réel.</p>
        <div className="space-y-1.5 text-sm">
          {[
            { event: "payment.completed", desc: "Paiement reçu avec succès" },
            { event: "payment.failed", desc: "Paiement échoué" },
            { event: "payout.completed", desc: "Décaissement effectué" },
            { event: "payout.failed", desc: "Décaissement échoué" },
            { event: "kyc.approved", desc: "KYC approuvé" },
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
