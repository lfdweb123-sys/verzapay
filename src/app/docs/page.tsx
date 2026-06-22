"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, CheckCircle2, Key, Zap, ArrowDownLeft, ArrowUpRight, Webhook, AlertTriangle, Moon, Sun } from "lucide-react";
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
      <div className="bg-ink-900 dark:bg-zinc-950 rounded-xl p-4 font-mono text-sm text-ink-100 overflow-x-auto border border-transparent dark:border-zinc-800">
        <pre className="whitespace-pre text-xs leading-relaxed">{code}</pre>
      </div>
      <button onClick={copy} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md bg-ink-700 hover:bg-ink-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors">
        {copied ? <CheckCircle2 size={13} className="text-success-50" /> : <Copy size={13} className="text-ink-300" />}
      </button>
    </div>
  );
}

function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("verzapay-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ? stored === "dark" : prefersDark;
    setDark(initial);
    document.documentElement.classList.toggle("dark", initial);
  }, []);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("verzapay-theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  return { dark, toggle };
}

export default function DocsPage() {
  const [active, setActive] = useState("introduction");
  const { dark, toggle } = useDarkMode();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll-spy : observe chaque section et met à jour le lien actif dans la sidebar
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          const id = visible[0].target.id;
          setActive(id);
        }
      },
      {
        rootMargin: "-15% 0px -65% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) {
        sectionRefs.current[s.id] = el;
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  function handleNavClick(id: string) {
    setActive(id);
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 dark:bg-zinc-950 transition-colors">
      <div className="grid lg:grid-cols-[220px_1fr] gap-10">
        {/* Sommaire sticky */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 flex flex-col">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold text-ink-400 dark:text-zinc-500 uppercase tracking-wider px-3 pb-2">
                Documentation
              </p>
              {SECTIONS.map((s) => (
                
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => handleNavClick(s.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active === s.id
                      ? "bg-brand-50 text-brand-800 font-medium dark:bg-brand-500/10 dark:text-brand-300"
                      : "text-ink-600 hover:bg-ink-50 hover:text-ink-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  )}
                >
                  <s.icon size={15} />
                  {s.label}
                </a>
              ))}
            </div>

            {/* Bouton mode sombre, en bas de la sidebar */}
            <div className="mt-4 pt-3 border-t border-ink-200 dark:border-zinc-800">
              <button
                onClick={toggle}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
                aria-label={dark ? "Activer le mode clair" : "Activer le mode sombre"}
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
                {dark ? "Mode clair" : "Mode sombre"}
              </button>
            </div>
          </nav>
        </aside>

        {/* Contenu */}
        <article className="min-w-0 space-y-16 pb-10">
          <section id="introduction">
            <h1 className="text-3xl font-medium text-ink-900 dark:text-zinc-100 tracking-tight">
              Documentation API Verzapay
            </h1>
            <p className="mt-4 text-ink-600 dark:text-zinc-400 text-base leading-relaxed">
              L&apos;API Verzapay vous permet d&apos;intégrer l&apos;encaissement et le décaissement directement dans votre site ou votre application, avec une API REST simple, des réponses JSON prévisibles et des webhooks fiables.
            </p>
            <div className="mt-5 rounded-xl border border-ink-200 dark:border-zinc-800 bg-ink-50/60 dark:bg-zinc-900 p-4">
              <p className="text-sm text-ink-600 dark:text-zinc-400">
                <strong className="text-ink-900 dark:text-zinc-100">URL de base :</strong>{" "}
                <code className="font-mono text-brand-700 dark:text-brand-400">https://verzapay.com/api/v1</code>
              </p>
            </div>
          </section>

          <section id="authentication">
            <h2 className="text-xl font-medium text-ink-900 dark:text-zinc-100">Authentification</h2>
            <p className="mt-3 text-ink-600 dark:text-zinc-400 leading-relaxed">
              Toutes les requêtes doivent inclure votre clé secrète dans l&apos;en-tête{" "}
              <code className="font-mono text-sm bg-ink-100 dark:bg-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded">
                Authorization
              </code>
              . Vous pouvez générer votre clé depuis l&apos;espace Développeur de votre tableau de bord — elle ne sera affichée qu&apos;une seule fois.
            </p>
            <CodeBlock code={`Authorization: Bearer vpz_sk_votre_cle_secrete`} />
            <div className="rounded-lg bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 p-3.5 text-sm text-warning-900 dark:text-warning-300">
              Ne partagez jamais votre clé secrète et ne l&apos;exposez jamais côté frontend. Utilisez toujours un appel serveur à serveur.
            </div>
          </section>

          <section id="payments">
            <h2 className="text-xl font-medium text-ink-900 dark:text-zinc-100">Créer un paiement</h2>
            <p className="mt-3 text-ink-600 dark:text-zinc-400 leading-relaxed">
              Génère un lien de paiement que votre client peut utiliser pour régler par Mobile Money ou carte bancaire.
            </p>
            <div className="flex items-center gap-2 mt-4 mb-1">
              <span className="badge bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300">POST</span>
              <code className="font-mono text-sm text-ink-700 dark:text-zinc-300">/payments</code>
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
            <p className="text-sm font-medium text-ink-900 dark:text-zinc-100 mt-5 mb-2">Réponse</p>
            <CodeBlock code={`{
  "id": "pay_8f3a9b2c",
  "status": "pending",
  "amount": 25000,
  "currency": "XOF",
  "checkout_url": "https://verzapay.com/pay/8f3a9b2c"
}`} />
          </section>

          <section id="payouts">
            <h2 className="text-xl font-medium text-ink-900 dark:text-zinc-100">Créer un décaissement</h2>
            <p className="mt-3 text-ink-600 dark:text-zinc-400 leading-relaxed">
              Envoie des fonds depuis votre solde Verzapay vers un compte Mobile Money.
            </p>
            <div className="flex items-center gap-2 mt-4 mb-1">
              <span className="badge bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300">POST</span>
              <code className="font-mono text-sm text-ink-700 dark:text-zinc-300">/payouts</code>
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
            <h2 className="text-xl font-medium text-ink-900 dark:text-zinc-100">Webhooks</h2>
            <p className="mt-3 text-ink-600 dark:text-zinc-400 leading-relaxed">
              Configurez une URL de webhook depuis votre espace Développeur pour recevoir des notifications en temps réel à chaque événement.
            </p>
            <div className="space-y-1.5 mt-4">
              {[
                { event: "payment.completed", desc: "Paiement reçu avec succès" },
                { event: "payment.failed", desc: "Paiement échoué" },
                { event: "payout.completed", desc: "Décaissement effectué" },
                { event: "payout.failed", desc: "Décaissement échoué" },
              ].map((e) => (
                <div key={e.event} className="flex items-center gap-3 p-2.5 rounded-lg border border-ink-100 dark:border-zinc-800">
                  <code className="text-xs font-mono text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-300 px-2 py-0.5 rounded shrink-0">
                    {e.event}
                  </code>
                  <span className="text-sm text-ink-600 dark:text-zinc-400">{e.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-medium text-ink-900 dark:text-zinc-100 mt-5 mb-2">Exemple de handler (Node.js)</p>
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
            <h2 className="text-xl font-medium text-ink-900 dark:text-zinc-100">Codes d&apos;erreur</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-ink-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 dark:bg-zinc-900 border-b border-ink-200 dark:border-zinc-800">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500 dark:text-zinc-400">Code</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500 dark:text-zinc-400">Signification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-zinc-800">
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
                      <td className="px-4 py-2.5 font-mono text-ink-900 dark:text-zinc-100">{code}</td>
                      <td className="px-4 py-2.5 text-ink-600 dark:text-zinc-400">{desc}</td>
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