import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, Store, Code2, Handshake, MessageCircle, Webhook, Link2, CheckCircle2, ExternalLink } from "lucide-react";
import { LegalPageHeader } from "@/components/marketing/legal-page-header";

export const metadata: Metadata = {
  title: "Intégrations et partenaires — Verzapay",
  description: "Connectez Verzapay à WooCommerce, Shopify ou votre site sur mesure grâce à l'API et aux webhooks.",
};

const FLOW = [
  { icon: Link2, title: "1. Créer le paiement", text: "À la commande, votre boutique appelle l'API Verzapay et reçoit un lien de paiement." },
  { icon: ShoppingCart, title: "2. Rediriger le client", text: "Le client règle par Mobile Money ou carte bancaire dans les pays couverts." },
  { icon: Webhook, title: "3. Valider par webhook", text: "Verzapay notifie votre boutique à la réception du paiement : vous marquez la commande comme payée." },
];

const PHP_SNIPPET = `<?php
// WooCommerce — créer le lien de paiement Verzapay pour une commande (à adapter)
$response = wp_remote_post( 'https://www.verzapay.com/api/v1/payments', [
  'headers' => [
    'Authorization' => 'Bearer ' . VERZAPAY_SECRET_KEY, // clé secrète, jamais dans le navigateur
    'Content-Type'  => 'application/json',
  ],
  'body' => wp_json_encode( [
    'amount'         => (int) $order->get_total(),
    'currency'       => 'XOF',
    'description'    => 'Commande #' . $order->get_id(),
    'customer_name'  => $order->get_billing_first_name(),
    'customer_phone' => $order->get_billing_phone(), // format international, requis
    'merchant_reference' => (string) $order->get_id(),
  ] ),
] );
$payment = json_decode( wp_remote_retrieve_body( $response ), true );
// Redirigez le client vers le lien de paiement renvoyé par l'API,
// puis validez la commande uniquement à la réception du webhook payment.completed.`;

export default function IntegrationsPage() {
  return (
    <article className="space-y-10">
      <LegalPageHeader
        title="Intégrations et partenaires"
        subtitle="Connectez Verzapay à votre boutique en ligne grâce à l'API et aux webhooks."
      />

      <section>
        <h2 className="text-xl font-medium text-ink-900">Comment ça marche</h2>
        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          {FLOW.map((s) => (
            <div key={s.title} className="rounded-xl border border-ink-200 p-4">
              <s.icon size={20} className="text-brand-700" />
              <p className="mt-2 text-sm font-medium text-ink-900">{s.title}</p>
              <p className="mt-1 text-xs text-ink-500 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-ink-200 p-5">
          <div className="flex items-center gap-2.5"><ShoppingCart size={20} className="text-brand-700" /><h3 className="font-medium text-ink-900">WooCommerce</h3></div>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Un plugin WordPress Verzapay est disponible sur GitHub. Vous pouvez aussi intégrer Verzapay vous-même par l&apos;API et les webhooks avec l&apos;exemple ci-dessous.
          </p>
          <a
            href="https://github.com/lfdweb123-sys/plugin-verzapay-wordpress"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-ink-900 text-white text-sm font-medium px-3.5 h-9 hover:bg-ink-800 transition-colors"
          >
            <ExternalLink size={15} /> Plugin WordPress Verzapay
          </a>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
            <li className="flex gap-2"><CheckCircle2 size={15} className="text-success-700 mt-0.5 shrink-0" /> Création du lien de paiement à la commande</li>
            <li className="flex gap-2"><CheckCircle2 size={15} className="text-success-700 mt-0.5 shrink-0" /> Commande validée par webhook (jamais sur la simple redirection)</li>
          </ul>
        </div>
        <div className="rounded-xl border border-ink-200 p-5">
          <div className="flex items-center gap-2.5"><Store size={20} className="text-brand-700" /><h3 className="font-medium text-ink-900">Shopify</h3></div>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Via une application personnalisée : elle crée le lien de paiement Verzapay pour la commande, puis marque la commande comme payée grâce au webhook Verzapay. Pas d&apos;extension officielle dans la boutique d&apos;applications Shopify pour le moment.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
            <li className="flex gap-2"><CheckCircle2 size={15} className="text-success-700 mt-0.5 shrink-0" /> Liens de paiement par commande ou facture</li>
            <li className="flex gap-2"><CheckCircle2 size={15} className="text-success-700 mt-0.5 shrink-0" /> Notifications en temps réel par webhook</li>
          </ul>
        </div>
        <div className="rounded-xl border border-ink-200 p-5 md:col-span-2">
          <div className="flex items-center gap-2.5"><Code2 size={20} className="text-brand-700" /><h3 className="font-medium text-ink-900">Site ou application sur mesure</h3></div>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Toute plateforme capable d&apos;appeler une API HTTPS peut accepter des paiements Verzapay. Consultez la{" "}
            <Link href="/docs" className="text-brand-700 hover:underline">documentation API</Link>, testez vos appels depuis l&apos;
            <Link href="/developers" className="text-brand-700 hover:underline">espace développeur</Link>{" "}
            et vérifiez les <Link href="/countries" className="text-brand-700 hover:underline">pays</Link> et{" "}
            <Link href="/currencies" className="text-brand-700 hover:underline">devises</Link> disponibles.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-medium text-ink-900">Exemple WooCommerce (PHP)</h2>
        <pre className="mt-4 rounded-xl bg-ink-900 text-ink-50 text-xs leading-relaxed p-4 overflow-x-auto notranslate" translate="no"><code>{PHP_SNIPPET}</code></pre>
        <p className="mt-2 text-xs text-ink-400">Exemple illustratif à adapter et à tester sur votre boutique avant toute mise en production.</p>
      </section>

      <section className="rounded-xl border border-ink-200 bg-ink-50/50 p-5 space-y-3">
        <div className="flex items-center gap-2.5"><Handshake size={20} className="text-brand-700" /><h2 className="font-medium text-ink-900">Partenaires et agences</h2></div>
        <p className="text-sm text-ink-600 leading-relaxed">
          Vous êtes une agence, un éditeur de solution e-commerce ou un développeur ? Contactez-nous pour construire une intégration ou un partenariat avec Verzapay.
        </p>
        <p className="text-sm text-ink-600 leading-relaxed">
          Besoin qu&apos;on intègre Verzapay à votre place ? Un développeur peut s&apos;en charger (service payant : 30 000 F).
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="https://wa.me/2290190083857" target="_blank" rel="noopener noreferrer" className="btn-primary text-sm"><MessageCircle size={15} /> Discuter sur WhatsApp</a>
          <Link href="/contact" className="btn-secondary text-sm">Nous écrire</Link>
        </div>
      </section>
    </article>
  );
}
