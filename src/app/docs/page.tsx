"use client";

import { useState, useEffect, useRef, useContext } from "react";
import {
  Copy, CheckCircle2, Key, Zap, ArrowDownLeft, ArrowUpRight,
  Webhook, AlertTriangle, Moon, Sun, Globe, Loader2, MessageCircle,
} from "lucide-react";
import { DocsDarkContext } from "./layout";

const SECTIONS = [
  { id: "introduction", label: "Introduction", icon: Zap },
  { id: "authentication", label: "Authentification", icon: Key },
  { id: "countries", label: "Pays disponibles", icon: Globe },
  { id: "payments", label: "Créer un paiement", icon: ArrowDownLeft },
  { id: "payouts", label: "Créer un décaissement", icon: ArrowUpRight },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "errors", label: "Codes d'erreur", icon: AlertTriangle },
  { id: "assistance", label: "Aide à l'intégration", icon: MessageCircle },
];

// URL de base de l'API, dérivée de la variable d'environnement publique au
// lieu d'une chaîne en dur — reste correcte automatiquement en preview/staging.
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://verzapay.com";
const API_BASE_URL = `${APP_BASE_URL}/api/v1`;

interface PublicCountry {
  code: string;
  name: string;
  indicator: string;
  currency: string;
  paymentEnabled: boolean;
  transferEnabled: boolean;
  channels: string[];
}

const CHANNEL_LABELS: Record<string, string> = {
  MOBILE_MONEY: "Mobile Money",
  CREDIT_CARD: "Carte bancaire",
  BANK_TRANSFER: "Virement bancaire",
};

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

  const [countries, setCountries] = useState<PublicCountry[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [countriesUpdatedAt, setCountriesUpdatedAt] = useState<string | null>(null);

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/countries");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur de chargement");
        setCountries(data.countries ?? []);
        setCountriesUpdatedAt(data.updatedAt ?? null);
      } catch (err) {
        setCountriesError((err as Error).message);
      } finally {
        setCountriesLoading(false);
      }
    })();
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
    successText:   dark ? "#86efac" : "#15803d",
    successBg:     dark ? "rgba(34,197,94,0.12)" : "#DCFCE7",
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
                  {API_BASE_URL}
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

          {/* Pays disponibles */}
          <section id="countries">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Pays disponibles
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Verzapay s&apos;appuie sur son réseau de partenaires de paiement pour couvrir progressivement de nouveaux marchés.
              Cette liste reflète en temps réel les pays et méthodes de paiement réellement actifs sur la plateforme.
            </p>

            {countriesLoading ? (
              <div className="flex items-center gap-2 mt-6 text-sm" style={{ color: c.textMuted }}>
                <Loader2 size={15} className="animate-spin" />
                Chargement de la liste des pays…
              </div>
            ) : countriesError ? (
              <div
                className="mt-4 rounded-lg p-3.5 text-sm"
                style={{
                  backgroundColor: c.warningBg,
                  border: `1px solid ${c.warningBorder}`,
                  color: c.warningText,
                }}
              >
                {countriesError}
              </div>
            ) : (
              <>
                <div
                  className="mt-4 overflow-hidden rounded-xl overflow-x-auto"
                  style={{ border: `1px solid ${c.border}` }}
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: c.tableHead, borderBottom: `1px solid ${c.border}` }}>
                        <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: c.textFaint }}>
                          Pays
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: c.textFaint }}>
                          Indicatif
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: c.textFaint }}>
                          Devise
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: c.textFaint }}>
                          Méthodes de paiement
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: c.textFaint }}>
                          Décaissement
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {countries.map((country, i) => (
                        <tr
                          key={country.code}
                          style={{
                            borderBottom: i < countries.length - 1 ? `1px solid ${c.borderFaint}` : "none",
                          }}
                        >
                          <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: c.text }}>
                            {country.name}
                          </td>
                          <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: c.textMuted }}>
                            {country.indicator}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: c.textMuted }}>
                            {country.currency}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {country.channels.length > 0 ? (
                                country.channels.map((ch) => (
                                  <span
                                    key={ch}
                                    className="text-xs font-mono px-2 py-0.5 rounded shrink-0 whitespace-nowrap"
                                    style={{ backgroundColor: c.brandCodeBg, color: c.brandCode }}
                                  >
                                    {CHANNEL_LABELS[ch] ?? ch}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs" style={{ color: c.textFaint }}>—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {country.transferEnabled ? (
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded"
                                style={{ backgroundColor: c.successBg, color: c.successText }}
                              >
                                Disponible
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: c.textFaint }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {countriesUpdatedAt && (
                  <p className="text-xs mt-3" style={{ color: c.textFaint }}>
                    Dernière synchronisation : {new Date(countriesUpdatedAt).toLocaleString("fr-FR")}
                  </p>
                )}
              </>
            )}
          </section>

          {/* Paiements */}
          <section id="payments">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Créer un paiement
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Génère un lien de paiement que votre client peut utiliser pour régler par Mobile Money ou carte bancaire.
              Le pays est déduit automatiquement à partir du numéro de téléphone du client — voir{" "}
              <a href="#countries" style={{ color: c.brandCode }}>la liste des pays disponibles</a>.
            </p>
            <div
              className="mt-4 rounded-lg p-3.5 text-sm"
              style={{
                backgroundColor: c.warningBg,
                border: `1px solid ${c.warningBorder}`,
                color: c.warningText,
              }}
            >
              <strong>Le numéro de téléphone du client est requis</strong> pour générer le lien de paiement
              (paramètre <code className="font-mono">customer_phone</code>). Il doit être au format international,
              avec l&apos;indicatif du pays, par exemple <code className="font-mono">+22996000000</code>. Sans ce numéro,
              le pays ne peut pas être déterminé et la requête est rejetée avec une erreur <code className="font-mono">400</code>.
            </div>
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
            <CodeBlock dark={dark} code={`curl -X POST ${API_BASE_URL}/payments \\
  -H "Authorization: Bearer vpz_sk_votre_cle" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25000,
    "currency": "XOF",
    "description": "Commande #1234",
    "customer_name": "Kofi Mensah",
    "customer_phone": "+22996000000",
    "merchant_reference": "CMD-1234"
  }'`} />
            <p className="text-sm font-medium mt-5 mb-2" style={{ color: c.text }}>
              Réponse
            </p>
            <CodeBlock dark={dark} code={`{
  "id": "pay_8f3a9b2c",
  "status": "pending",
  "amount": 25000,
  "currency": "XOF",
  "charged_amount": 25000,
  "charged_currency": "XOF",
  "exchange_rate": 1,
  "checkout_url": "${APP_BASE_URL}/pay/8f3a9b2c"
}`} />

            <h3 className="text-base font-medium mt-8" style={{ color: c.text }}>Devises et conversion automatique</h3>
            <p className="mt-2 leading-relaxed" style={{ color: c.textMuted }}>
              <code className="font-mono" style={{ color: c.inlineCodeText }}>amount</code> est exprimé dans la devise{" "}
              <code className="font-mono" style={{ color: c.inlineCodeText }}>currency</code> (code ISO à 3 lettres, <strong style={{ color: c.text }}>XOF par défaut</strong>).
              Le client est débité dans la devise de son pays (déduit du numéro de téléphone, voir <a href="#countries" style={{ color: c.brandCode }}>Pays disponibles</a>) :
              Verzapay convertit automatiquement le montant. Exemple : <code className="font-mono" style={{ color: c.inlineCodeText }}>amount: 19.98, currency: &quot;EUR&quot;</code> avec
              un numéro français <code className="font-mono" style={{ color: c.inlineCodeText }}>+33…</code> est débité 19,98 EUR, sans conversion.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm list-disc pl-5" style={{ color: c.textMuted }}>
              <li>La réponse indique le montant réellement débité (<code className="font-mono">charged_amount</code>, <code className="font-mono">charged_currency</code>) et le taux appliqué (<code className="font-mono">exchange_rate</code> : unités de <code className="font-mono">charged_currency</code> pour 1 unité de <code className="font-mono">currency</code>).</li>
              <li>XOF, XAF et EUR sont liés à la parité fixe 1 EUR = 655,957 XOF/XAF. Les autres taux proviennent d&apos;une source de taux de change publique, rafraîchie plusieurs fois par jour.</li>
              <li>Si aucun taux fiable n&apos;est disponible, la requête est refusée (<code className="font-mono">503</code>) : aucun taux n&apos;est jamais estimé.</li>
              <li>Les limites (minimum 100 XOF, maximum 50 000 000 XOF) s&apos;appliquent à l&apos;équivalent en XOF.</li>
              <li>Votre solde et vos commissions restent exprimés en XOF.</li>
              <li><code className="font-mono">merchant_reference</code> (128 caractères max) est renvoyé tel quel dans le webhook : utilisez-le pour retrouver votre commande.</li>
              <li><code className="font-mono">metadata</code> (objet clé/valeur texte, 20 clés, 1000 caractères par valeur, 8000 au total) est conservé sur le paiement et renvoyé dans la réponse, par <code className="font-mono">GET /payments/{"{id}"}</code> et dans le webhook : vous pouvez ainsi ne rien enregistrer de votre côté avant le paiement et ne traiter la commande qu&apos;à la confirmation. <code className="font-mono">customer_email</code> est aussi renvoyé.</li>
            </ul>

            <div className="flex items-center gap-2 mt-8 mb-1">
              <span
                className="badge font-medium"
                style={{ backgroundColor: c.brandCodeBg, color: c.brandCode }}
              >
                GET
              </span>
              <code className="font-mono text-sm" style={{ color: c.inlineCodeText }}>
                /payments/{"{id}"}
              </code>
            </div>
            <p className="mt-2 leading-relaxed" style={{ color: c.textMuted }}>
              Retourne le statut d&apos;un paiement de votre compte (<code className="font-mono">pending</code>, <code className="font-mono">completed</code> ou <code className="font-mono">failed</code>).
              C&apos;est la méthode recommandée pour <a href="#webhook-security" style={{ color: c.brandCode }}>vérifier une notification webhook</a>.
            </p>
            <CodeBlock dark={dark} code={`curl ${API_BASE_URL}/payments/pay_8f3a9b2c \\
  -H "Authorization: Bearer vpz_sk_votre_cle"

{
  "id": "pay_8f3a9b2c",
  "status": "completed",
  "amount": 19.98,
  "currency": "EUR",
  "charged_amount": 19.98,
  "charged_currency": "EUR",
  "exchange_rate": 1,
  "merchant_reference": "CMD-1234",
  "created_at": 1792664000000,
  "completed_at": 1792664120000
}`} />
          </section>

          {/* Payouts */}
          <section id="payouts">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Créer un décaissement
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Envoie des fonds depuis votre solde Verzapay vers un compte Mobile Money. Disponible uniquement
              pour les pays marqués <strong style={{ color: c.text }}>Disponible</strong> dans la colonne Décaissement ci-dessus.
              Comme pour les paiements, <code className="font-mono" style={{ color: c.inlineCodeText }}>currency</code> (XOF par défaut) peut être n&apos;importe quelle devise :
              le bénéficiaire reçoit dans la devise de son pays, et votre solde (en XOF) est débité de l&apos;équivalent. Minimum 500 XOF (équivalent).
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
            <CodeBlock dark={dark} code={`curl -X POST ${API_BASE_URL}/payouts \\
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
            <div
              className="mt-4 rounded-xl p-4 text-sm leading-relaxed"
              style={{ backgroundColor: c.surfaceSoft, border: `1px solid ${c.border}`, color: c.textMuted }}
            >
              <strong style={{ color: c.text }}>Où renseigner l&apos;URL ?</strong> Connectez-vous à votre tableau de bord,
              ouvrez la page <strong style={{ color: c.text }}>Développeur</strong>, saisissez l&apos;URL de votre webhook
              dans le champ prévu à cet effet, puis enregistrez. Les notifications ne sont envoyées qu&apos;une fois cette URL renseignée.
            </div>
            <div
              className="mt-4 rounded-lg p-3.5 text-sm"
              style={{
                backgroundColor: c.warningBg,
                border: `1px solid ${c.warningBorder}`,
                color: c.warningText,
              }}
            >
              Votre URL de webhook doit impérativement commencer par <code className="font-mono">https://</code>.
              Une URL en <code className="font-mono">http://</code> entraîne une redirection que certains de nos
              partenaires ne suivent pas, ce qui empêche la notification d&apos;arriver.
            </div>
            <div
              className="mt-4 rounded-xl p-4 text-sm leading-relaxed"
              style={{ backgroundColor: c.surfaceSoft, border: `1px solid ${c.border}`, color: c.textMuted }}
            >
              <p className="font-medium" style={{ color: c.text }}>Comment vérifier qu&apos;un webhook vient bien de Verzapay ?</p>
              <p className="mt-2">
                Les webhooks Verzapay <strong style={{ color: c.text }}>ne sont pas signés</strong> : il n&apos;y a pas de secret
                de webhook ni d&apos;en-tête de signature à vérifier. La vérification se fait donc de votre côté, avec les
                règles ci-dessous :
              </p>
              <ol className="mt-2 list-decimal pl-5 space-y-1.5">
                <li>
                  <strong style={{ color: c.text }}>Utilisez une URL secrète.</strong> Ajoutez à votre URL un jeton long et
                  aléatoire que vous seul connaissez, par exemple <code className="font-mono">https://monsite.com/webhook/verzapay?token=VOTRE_JETON_ALEATOIRE</code>,
                  et refusez (401) toute requête dont le jeton est absent ou différent.
                </li>
                <li>
                  <strong style={{ color: c.text }}>Rapprochez le paiement de votre commande.</strong> Vérifiez que{" "}
                  <code className="font-mono">paymentId</code> (ou <code className="font-mono">merchantReference</code>) correspond à
                  un paiement que vous avez réellement créé, puis que <code className="font-mono">amount</code> et{" "}
                  <code className="font-mono">currency</code> correspondent à la commande. Ignorez tout identifiant inconnu.
                </li>
                <li>
                  <strong style={{ color: c.text }}>Ne faites confiance qu&apos;à votre propre base.</strong> Ne livrez pas une commande
                  uniquement parce qu&apos;un webhook l&apos;annonce : contrôlez qu&apos;elle est bien en attente chez vous.
                </li>
                <li>
                  <strong style={{ color: c.text }}>Soyez idempotent.</strong> Un même événement peut arriver plusieurs fois :
                  si la commande est déjà marquée payée, répondez <code className="font-mono">200</code> sans la retraiter.
                </li>
                <li>
                  <strong style={{ color: c.text }}>Répondez vite en HTTPS</strong> avec un statut <code className="font-mono">2xx</code>.
                </li>
              </ol>
            </div>
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
  // 1. Vérifier le jeton secret placé dans l'URL du webhook
  if (req.query.token !== process.env.VERZAPAY_WEBHOOK_TOKEN) {
    return res.status(401).end();
  }

  const event = req.body;
  // 2. Retrouver la commande via event.paymentId / event.merchantReference,
  //    comparer event.amount et ignorer si déjà traitée (idempotence)

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
            <p className="text-sm font-medium mt-5 mb-2" style={{ color: c.text }}>
              Contenu d&apos;une notification
            </p>
            <CodeBlock dark={dark} code={`{
  "type": "payment.completed",
  "paymentId": "pay_8f3a9b2c",
  "merchantReference": "CMD-1234",
  "amount": 19.98,
  "currency": "EUR",
  "chargedAmount": 19.98,
  "chargedCurrency": "EUR",
  "status": "completed",
  "customerName": "Kofi Mensah",
  "customerPhone": "+33612345678",
  "companyId": "..."
}`} />
            <p className="mt-2 text-sm" style={{ color: c.textMuted }}>
              <code className="font-mono">amount</code> et <code className="font-mono">currency</code> reprennent ce que vous avez demandé à la création.
              Pour les décaissements, <code className="font-mono">payoutId</code> remplace <code className="font-mono">paymentId</code>.
            </p>

            <h3 id="webhook-security" className="text-base font-medium mt-8" style={{ color: c.text }}>Sécuriser votre webhook</h3>
            <div
              className="mt-3 rounded-lg p-3.5 text-sm"
              style={{ backgroundColor: c.warningBg, border: `1px solid ${c.warningBorder}`, color: c.warningText }}
            >
              Les notifications Verzapay ne sont <strong>pas signées</strong> et il n&apos;existe pas de clé de webhook :
              n&apos;importe qui connaissant votre URL pourrait y envoyer une fausse notification. Appliquez impérativement les mesures ci-dessous.
            </div>
            <ol className="mt-3 space-y-2 text-sm list-decimal pl-5" style={{ color: c.textMuted }}>
              <li><strong style={{ color: c.text }}>Ajoutez un jeton secret à l&apos;URL</strong> que vous déclarez dans l&apos;espace Développeur, par exemple{" "}
                <code className="font-mono">https://votre-site.com/webhook/verzapay?k=UNE_VALEUR_ALEATOIRE_DE_32_CARACTERES</code>. Générez-le vous-même, gardez-le secret
                (variable d&apos;environnement), et rejetez (401) toute requête dont <code className="font-mono">k</code> ne correspond pas, avec une comparaison à temps constant.</li>
              <li><strong style={{ color: c.text }}>Ne faites jamais confiance au contenu.</strong> À la réception de <code className="font-mono">payment.completed</code>, appelez{" "}
                <code className="font-mono">GET /payments/{"{paymentId}"}</code> avec votre clé secrète et n&apos;activez la commande que si <code className="font-mono">status</code> vaut <code className="font-mono">completed</code>.</li>
              <li><strong style={{ color: c.text }}>Recoupez avec votre commande</strong> : <code className="font-mono">merchant_reference</code>, montant et devise doivent correspondre à ce que vous avez créé.</li>
              <li><strong style={{ color: c.text }}>Soyez idempotent</strong> : la même notification peut arriver plusieurs fois. Mémorisez les <code className="font-mono">paymentId</code> déjà traités.</li>
              <li><strong style={{ color: c.text }}>HTTPS uniquement</strong>, réponse <code className="font-mono">200</code> rapide, traitement long en tâche de fond. Ignorez les <code className="font-mono">type</code> inconnus.</li>
            </ol>
            <CodeBlock dark={dark} code={`app.post('/webhook/verzapay', async (req, res) => {
  // 1) jeton secret dans l'URL (comparaison à temps constant)
  const given = Buffer.from(String(req.query.k || ''));
  const secret = Buffer.from(process.env.VERZAPAY_WEBHOOK_TOKEN);
  if (given.length !== secret.length || !crypto.timingSafeEqual(given, secret)) {
    return res.status(401).end();
  }

  const event = req.body;
  if (event.type === 'payment.completed') {
    // 2) contre-vérification auprès de l'API (la notification seule ne prouve rien)
    const r = await fetch(\`${API_BASE_URL}/payments/\${event.paymentId}\`, {
      headers: { Authorization: 'Bearer ' + process.env.VERZAPAY_SECRET_KEY },
    });
    const pay = await r.json();
    // 3) recoupement avec votre commande
    if (pay.status === 'completed' && pay.merchant_reference === order.ref && pay.amount === order.amount) {
      // 4) idempotence : ignorer si déjà traité, sinon activer la commande
    }
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

          {/* Aide à l'intégration */}
          <section id="assistance">
            <h2 className="text-xl font-medium" style={{ color: c.text }}>
              Aide à l&apos;intégration
            </h2>
            <p className="mt-3 leading-relaxed" style={{ color: c.textMuted }}>
              Vous n&apos;arrivez pas à intégrer l&apos;API ? Vous pouvez confier l&apos;intégration à un développeur web
              en le contactant sur WhatsApp.
            </p>
            <div
              className="mt-4 rounded-xl p-4 text-sm leading-relaxed"
              style={{ backgroundColor: c.warningBg, border: `1px solid ${c.warningBorder}`, color: c.warningText }}
            >
              <p>
                <strong>WhatsApp :</strong>{" "}
                <a
                  href="https://wa.me/2290190083857"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline"
                >
                  +229 01 90 08 38 57
                </a>
              </p>
              <p className="mt-1.5">
                <strong>Service payant :</strong> 30 000 F pour l&apos;intégration.
              </p>
            </div>
          </section>

        </article>
      </div>
    </div>
  );
}