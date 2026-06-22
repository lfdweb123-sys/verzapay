"use client";

import { useState } from "react";
import { Copy, CheckCircle2, Key, Zap, ArrowDownLeft, ArrowUpRight, Webhook, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "introduction", label: "Introduction", icon: Zap },
  { id: "authentication", label: "Authentification", icon: Key },
  { id: "payments", label: "Créer un paiement", icon: ArrowDownLeft },
  { id: "payouts", label: "Créer un décaissement", icon: ArrowUpRight },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "errors", label: "Codes d'erreur", icon: AlertTriangle },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative my-4">
      <div className="bg-ink-900 rounded-xl p-4 font-mono text-sm text-ink-100 overflow-x-auto">
        <pre className="whitespace-pre text-xs leading-relaxed">{code}</pre>
      </div>
      <button onClick={copy} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md bg-ink-700 hover:bg-ink-600 flex items-center justify-center transition-colors">
        {copied ? <CheckCircle2 size={13} className="text-success-50" /> : <Copy size={13} className="text-ink-300" />}
      </button>
    </div>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState("introduction");

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-[220px_1fr] gap-10">
        {/* Sommaire sticky */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-0.5">
            <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider px-3 pb-2">Documentation</p>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active === s.id ? "bg-brand-50 text-brand-800 font-medium" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                )}
              >
                <s.icon size={15} />
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Contenu */}
        <article className="min-w-0 space-y-16 pb-10">
          <section id="introduction">
            <h1 className="text-3xl font-medium text-ink-900 tracking-tight">Documentation API Verzapay</h1>
            <p className="mt-4 text-ink-600 text-base leading-relaxed">
              L&apos;API Verzapay vous permet d&apos;intégrer l&apos;encaissement et le décaissement directement dans votre site ou votre application, avec une API REST simple, des réponses JSON prévisibles et des webhooks fiables.
            </p>
            <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50/60 p-4">
              <p className="text-sm text-ink-600"><strong className="text-ink-900">URL de base :</strong> <code className="font-mono text-brand-700">https://verzapay.com/api/v1</code></p>
            </div>
          </section>

          <section id="authentication">
            <h2 className="text-xl font-medium text-ink-900">Authentification</h2>
            <p className="mt-3 text-ink-600 leading-relaxed">
              Toutes les requêtes doivent inclure votre clé secrète dans l&apos;en-tête <code className="font-mono text-sm bg-ink-100 px-1.5 py-0.5 rounded">Authorization</code>. Vous pouvez générer votre clé depuis l&apos;espace Développeur de votre tableau de bord — elle ne sera affichée qu&apos;une seule fois.
            </p>
            <CodeBlock code={`Authorization: Bearer vpz_sk_votre_cle_secrete`} />
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3.5 text-sm text-warning-900">
              Ne partagez jamais votre clé secrète et ne l&apos;exposez jamais côté frontend. Utilisez toujours un appel serveur à serveur.
            </div>
          </section>

          <section id="payments">
            <h2 className="text-xl font-medium text-ink-900">Créer un paiement</h2>
            <p className="mt-3 text-ink-600 leading-relaxed">
              Génère un lien de paiement que votre client peut utiliser pour régler par Mobile Money ou carte bancaire.
            </p>
            <div className="flex items-center gap-2 mt-4 mb-1">
              <span className="badge bg-brand-50 text-brand-800">POST</span>
              <code className="font-mono text-sm text-ink-700">/payments</code>
            </div>
            <CodeBlock code={`curl -X POST https://verzapay.com/api/v1/payments \\
  -H "Authorization: Bearer vpz_sk_votre_cle" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25000,
    "currency": "XOF",
    "description": "Commande #1234",
    "customer_name": "Kofi Mensah",
    "customer_phone": "+22996000000"
  }'`} />
            <p className="text-sm font-medium text-ink-900 mt-5 mb-2">Réponse</p>
            <CodeBlock code={`{
  "id": "pay_8f3a9b2c",
  "status": "pending",
  "amount": 25000,
  "currency": "XOF",
  "checkout_url": "https://verzapay.com/pay/8f3a9b2c"
}`} />
          </section>

          <section id="payouts">
            <h2 className="text-xl font-medium text-ink-900">Créer un décaissement</h2>
            <p className="mt-3 text-ink-600 leading-relaxed">
              Envoie des fonds depuis votre solde Verzapay vers un compte Mobile Money.
            </p>
            <div className="flex items-center gap-2 mt-4 mb-1">
              <span className="badge bg-brand-50 text-brand-800">POST</span>
              <code className="font-mono text-sm text-ink-700">/payouts</code>
            </div>
            <CodeBlock code={`curl -X POST https://verzapay.com/api/v1/payouts \\
  -H "Authorization: Bearer vpz_sk_votre_cle" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 10000,
    "currency": "XOF",
    "recipient_phone": "+22996000000",
    "recipient_name": "Kofi Mensah"
  }'`} />
          </section>

          <section id="webhooks">
            <h2 className="text-xl font-medium text-ink-900">Webhooks</h2>
            <p className="mt-3 text-ink-600 leading-relaxed">
              Configurez une URL de webhook depuis votre espace Développeur pour recevoir des notifications en temps réel à chaque événement.
            </p>
            <div className="space-y-1.5 mt-4">
              {[
                { event: "payment.completed", desc: "Paiement reçu avec succès" },
                { event: "payment.failed", desc: "Paiement échoué" },
                { event: "payout.completed", desc: "Décaissement effectué" },
                { event: "payout.failed", desc: "Décaissement échoué" },
              ].map((e) => (
                <div key={e.event} className="flex items-center gap-3 p-2.5 rounded-lg border border-ink-100">
                  <code className="text-xs font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded shrink-0">{e.event}</code>
                  <span className="text-sm text-ink-600">{e.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-medium text-ink-900 mt-5 mb-2">Exemple de handler (Node.js)</p>
            <CodeBlock code={`app.post('/webhook/verzapay', (req, res) => {
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
});`} />
          </section>

          <section id="errors">
            <h2 className="text-xl font-medium text-ink-900">Codes d&apos;erreur</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-ink-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 border-b border-ink-200">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Code</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Signification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {[
                    ["200", "Succès"],
                    ["400", "Requête invalide — vérifiez les paramètres"],
                    ["401", "Clé API invalide ou manquante"],
                    ["403", "KYC non approuvé ou permission insuffisante"],
                    ["404", "Ressource introuvable"],
                    ["429", "Trop de requêtes — limite atteinte"],
                    ["500", "Erreur serveur — réessayez plus tard"],
                  ].map(([code, desc]) => (
                    <tr key={code}>
                      <td className="px-4 py-2.5 font-mono text-ink-900">{code}</td>
                      <td className="px-4 py-2.5 text-ink-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
