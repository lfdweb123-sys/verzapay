"use client";

import { useState, useEffect, useRef, useContext } from "react";
import { Copy, CheckCircle2, Key, Zap, ArrowDownLeft, ArrowUpRight, Webhook, AlertTriangle, Moon, Sun } from "lucide-react";
import { DocsDarkContext } from "./layout";

const SECTIONS = [
  { id: "introduction", label: "Introduction", icon: Zap },
  { id: "authentication", label: "Authentification", icon: Key },
  { id: "payments", label: "Créer un paiement", icon: ArrowDownLeft },
  { id: "payouts", label: "Créer un décaissement", icon: ArrowUpRight },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "errors", label: "Codes d'erreur", icon: AlertTriangle },
];

function CodeBlock({ code, dark }: { code: string; dark: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative my-4">
      <div
        className="rounded-xl p-4 font-mono text-sm overflow-x-auto"
        style={{
          backgroundColor: dark ? "#030712" : "#1A1A19",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: dark ? "#27272a" : "transparent",
          color: "#f1efe8",
        }}
      >
        <pre className="whitespace-pre text-xs leading-relaxed">{code}</pre>
      </div>
      <button
        onClick={copy}
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
        style={{ backgroundColor: dark ? "#27272a" : "#444441" }}
      >
        {copied
          ? <CheckCircle2 size={13} className="text-success-50" />
          : <Copy size={13} style={{ color: "#D3D1C7" }} />
        }
      </button>
    </div>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState("introduction");
  const { dark, toggle } = useContext(DocsDarkContext);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
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

  const c = {
    bg:            dark ? "#09090b" : "transparent",
    text:          dark ? "#f4f4f5" : "#1A1A19",
    textMuted:     dark ? "#a1a1aa" : "#5F5E5A",
    textFaint:     dark ? "#71717a" : "#888780",
    border:        dark ? "#27272a" : "#E4E2DA",
    borderFaint:   dark ? "#27272a" : "#F1EFE8",
    surfaceSoft:   dark ? "#18181b" : "rgba(248,248,247,0.6)",
    navActive:     dark ? "rgba(31,111,196,0.12)" : "#E6F1FB",
    navActiveText: dark ? "#93c5fd" : "#0C447C",
    navHover:      dark ? "#27272a" : "#F8F8F7",
    navHoverText:  dark ? "#f4f4f5" : "#1A1A19",
    warningBg:     dark ? "rgba(186,117,23,0.1)" : "#FAEEDA",
    warningBorder: dark ? "rgba(186,117,23,0.3)" : "#F0C97A",
    warningText:   dark ? "#fbbf24" : "#412402",
    tableHead:     dark ? "#18181b" : "#F8F8F7",
    brandCode:     dark ? "#93c5fd" : "#114A82",
    brandCodeBg:   dark ? "rgba(31,111,196,0.12)" : "#E6F1FB",
    inlineCode:    dark ? "#27272a" : "#F1EFE8",
    inlineCodeText:dark ? "#e4e4e7" : "#2C2C2A",
  };

  return (
    <div
      className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 transition-colors"
      style={{ backgroundColor: c.bg }}
    >
      <div className="grid lg:grid-cols-[220px_1fr] gap-10">

        {/* ── Sidebar nav ── */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 flex flex-col">
            <div className="space-y-0.5">
              <p
                className="text-[11px] font-semibold uppercase tracking-wider px-3 pb-2"
                style={{ color: c.textFaint }}
              >
                Documentation
              </p>
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const isActive = active === s.id;
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={() => setActive(s.id)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
                    style={{
                      backgroundColor: isActive ? c.navActive : "transparent",
                      color: isActive ? c.navActiveText : c.textMuted,
                      fontWeight: isActive ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = c.navHover;
                        (e.currentTarget as HTMLElement).style.color = c.navHoverText;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        (e.currentTarget as HTMLElement).style.color = c.textMuted;
                      }
                    }}
                  >
                    <Icon size={15} />
                    {s.label}
                  </a>
                );
              })}
            </div>

            <div
              className="mt-4 pt-3"
              style={{ borderTop: `1px solid ${c.border}` }}
            >
              <button
                onClick={toggle}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{ color: c.textMuted }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = c.navHover;
                  (e.currentTarget as HTMLElement).style.color = c.navHoverText;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.color = c.textMuted;
                }}
                aria-label={dark ? "Activer le mode clair" : "Activer le mode sombre"}
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
                {dark ? "Mode clair" : "Mode sombre"}
              </button>
            </div>
          </nav>
        </aside>

        {/* ── Contenu ── */}
        <article className="min-w-0 space-y-16 pb-10">

          {/* Introduction */}
          <section id="introduction">
            <h1 className="text-3xl font-medium tracking-tight" style={{ color: c.text }}>
              Documentation API Verzapay
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: c.textMuted }}>
              L&apos;API Verzapay vous permet d&apos;intégrer l&apos;encaissement et le décaissement directement dans votre site ou votre application, avec une API REST simple, des réponses JSON prévisibles et des webhooks fiables.
            </p>
            <div
              className="mt-5 rounded-xl p-4"
              style={{ backgroundColor: c.surfaceSoft, border: `1px solid ${c.border}` }}
            >
              <p className="text-sm" style={{ color: c.textMuted }}>
                <strong style={{ color: c.text }}>URL de base :</strong>{" "}
                <code className="font-mono" style={{ color: "#378ADD" }}>
                  https://verzapay.com/api/v1
                </code>
              </p>
            </div>
          </section>

          {/* Authentification */}
          <section id="authentication">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Authentification
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Toutes les requêtes doivent inclure votre clé secrète dans l&apos;en-tête{" "}
              <code
                className="font-mono text-sm px-1.5 py-0.5 rounded"
                style={{ backgroundColor: c.inlineCode, color: c.inlineCodeText }}
              >
                Authorization
              </code>
              . Vous pouvez générer votre clé depuis l&apos;espace Développeur de votre tableau de bord — elle ne sera affichée qu&apos;une seule fois.
            </p>
            <CodeBlock dark={dark} code={`Authorization: Bearer vpz_sk_votre_cle_secrete`} />
            <div
              className="rounded-lg p-3.5 text-sm"
              style={{
                backgroundColor: c.warningBg,
                border: `1px solid ${c.warningBorder}`,
                color: c.warningText,
              }}
            >
              Ne partagez jamais votre clé secrète et ne l&apos;exposez jamais côté frontend. Utilisez toujours un appel serveur à serveur.
            </div>
          </section>

          {/* Paiements */}
          <section id="payments">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Créer un paiement
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Génère un lien de paiement que votre client peut utiliser pour régler par Mobile Money ou carte bancaire.
            </p>
            <div className="flex items-center gap-2 mt-4 mb-1">
              <span
                className="badge font-medium"
                style={{ backgroundColor: c.brandCodeBg, color: c.brandCode }}
              >
                POST
              </span>
              <code className="font-mono text-sm" style={{ color: c.inlineCodeText }}>
                /payments
              </code>
            </div>
            <CodeBlock dark={dark} code={`curl -X POST https://verzapay.com/api/v1/payments \\
  -H "Authorization: Bearer vpz_sk_votre_cle" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25000,
    "currency": "XOF",
    "description": "Commande #1234",
    "customer_name": "Kofi Mensah",
    "customer_phone": "+22996000000"
  }'`} />
            <p className="text-sm font-medium mt-5 mb-2" style={{ color: c.text }}>
              Réponse
            </p>
            <CodeBlock dark={dark} code={`{
  "id": "pay_8f3a9b2c",
  "status": "pending",
  "amount": 25000,
  "currency": "XOF",
  "checkout_url": "https://verzapay.com/pay/8f3a9b2c"
}`} />
          </section>

          {/* Payouts */}
          <section id="payouts">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Créer un décaissement
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Envoie des fonds depuis votre solde Verzapay vers un compte Mobile Money.
            </p>
            <div className="flex items-center gap-2 mt-4 mb-1">
              <span
                className="badge font-medium"
                style={{ backgroundColor: c.brandCodeBg, color: c.brandCode }}
              >
                POST
              </span>
              <code className="font-mono text-sm" style={{ color: c.inlineCodeText }}>
                /payouts
              </code>
            </div>
            <CodeBlock dark={dark} code={`curl -X POST https://verzapay.com/api/v1/payouts \\
  -H "Authorization: Bearer vpz_sk_votre_cle" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 10000,
    "currency": "XOF",
    "recipient_phone": "+22996000000",
    "recipient_name": "Kofi Mensah"
  }'`} />
          </section>

          {/* Webhooks */}
          <section id="webhooks">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Webhooks
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Configurez une URL de webhook depuis votre espace Développeur pour recevoir des notifications en temps réel à chaque événement.
            </p>
            <div className="space-y-1.5 mt-4">
              {[
                { event: "payment.completed", desc: "Paiement reçu avec succès" },
                { event: "payment.failed",    desc: "Paiement échoué" },
                { event: "payout.completed",  desc: "Décaissement effectué" },
                { event: "payout.failed",     desc: "Décaissement échoué" },
              ].map((e) => (
                <div
                  key={e.event}
                  className="flex items-center gap-3 p-2.5 rounded-lg"
                  style={{ border: `1px solid ${c.borderFaint}` }}
                >
                  <code
                    className="text-xs font-mono px-2 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: c.brandCodeBg, color: c.brandCode }}
                  >
                    {e.event}
                  </code>
                  <span className="text-sm" style={{ color: c.textMuted }}>
                    {e.desc}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm font-medium mt-5 mb-2" style={{ color: c.text }}>
              Exemple de handler (Node.js)
            </p>
            <CodeBlock dark={dark} code={`app.post('/webhook/verzapay', (req, res) => {
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

          {/* Erreurs */}
          <section id="errors">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Codes d&apos;erreur
            </h2>
            <div
              className="mt-4 overflow-hidden rounded-xl"
              style={{ border: `1px solid ${c.border}` }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: c.tableHead, borderBottom: `1px solid ${c.border}` }}>
                    <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: c.textFaint }}>
                      Code
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: c.textFaint }}>
                      Signification
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["200", "Succès"],
                    ["400", "Requête invalide — vérifiez les paramètres"],
                    ["401", "Clé API invalide ou manquante"],
                    ["403", "KYC non approuvé ou permission insuffisante"],
                    ["404", "Ressource introuvable"],
                    ["429", "Trop de requêtes — limite atteinte"],
                    ["500", "Erreur serveur — réessayez plus tard"],
                  ].map(([code, desc], i, arr) => (
                    <tr
                      key={code}
                      style={{
                        borderBottom: i < arr.length - 1 ? `1px solid ${c.borderFaint}` : "none",
                      }}
                    >
                      <td className="px-4 py-2.5 font-mono" style={{ color: c.text }}>
                        {code}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: c.textMuted }}>
                        {desc}
                      </td>
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