"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Smartphone, CreditCard, CheckCircle2 } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white pt-28 pb-16 sm:pt-36 sm:pb-24">
      {/* Rayures verticales discrètes en fond */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, #f4f3ee 0px, #f4f3ee 64px, transparent 64px, transparent 128px)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 75%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, black 0%, black 75%, transparent 100%)",
        }}
      />

      {/* Halo radial discret en fond, ancré côté droit */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-10 w-[640px] h-[640px] rounded-full opacity-[0.5]"
        style={{ background: "radial-gradient(circle, #E6F1FB 0%, transparent 70%)" }}
      />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_460px] gap-12 lg:gap-8 items-center">
          {/* Colonne texte */}
          <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left flex flex-col items-center lg:items-start">
            <h1 className="text-[1.9rem] leading-[1.2] sm:text-5xl sm:leading-[1.05] lg:text-[3.4rem] lg:leading-[1.04] font-medium text-ink-900 tracking-tight">
              Encaissez vos clients, Décaissez facilement.{" "}
              <span className="text-brand-700">Une seule plateforme.</span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-ink-600 leading-relaxed">
              Verzapay connecte Mobile Money et carte bancaire à votre activité, avec une vérification d&apos;identité intégrée pour chaque marchand. Créez un lien de paiement en 30 secondes, suivez vos encaissements en temps réel, reversez en un clic.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
              <Link href="/register" className="btn-primary h-12 px-6 text-[15px] w-full sm:w-auto justify-center">
                Créer un compte gratuit
                <ArrowRight size={16} />
              </Link>
              <a href="#fonctionnement" className="btn-secondary h-12 px-6 text-[15px] w-full sm:w-auto justify-center">
                Voir comment ça marche
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-brand-600" /> KYC intégré</span>
              <span className="inline-flex items-center gap-1.5"><Smartphone size={14} className="text-brand-600" /> Mobile Money</span>
              <span className="inline-flex items-center gap-1.5"><CreditCard size={14} className="text-brand-600" /> Carte bancaire</span>
            </div>
          </div>

          {/* Colonne visuelle : démo du flux de paiement, signature de la page */}
          <PaymentFlowCard />
        </div>
      </div>
    </section>
  );
}

function PaymentFlowCard() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      {/* Carte "lien de paiement" en arrière-plan, légèrement décalée */}
      <div className="absolute -top-4 -left-4 right-4 bottom-4 rounded-2xl bg-brand-50 border border-brand-100 -z-10" />

      <div className="rounded-2xl border border-ink-200 bg-white shadow-popover overflow-hidden">
        {/* Header simulateur */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-brand-700">
          <span className="text-white text-sm font-medium">Lien de paiement</span>
          <span className="text-brand-100 text-xs font-mono">#VPZ-7421</span>
        </div>

        {/* Montant */}
        <div className="px-5 pt-5 pb-4 text-center border-b border-ink-100">
          <p className="text-xs text-ink-500">Boutique Zack vous demande</p>
          <p className="text-3xl font-medium text-ink-900 mt-1 tabular-nums">25 000 XOF</p>
          <p className="text-xs text-ink-500 mt-1">Commande #1234 — Robe wax taille M</p>
        </div>

        {/* Méthodes de paiement */}
        <div className="p-5 space-y-2.5">
          <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-2">Choisir un moyen de paiement</p>

          <div className="flex items-center gap-3 rounded-xl border-2 border-brand-600 bg-brand-50 px-3.5 py-3">
            <div className="w-9 h-9 rounded-lg bg-brand-700 flex items-center justify-center shrink-0">
              <Smartphone size={17} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-900">Mobile Money</p>
              <p className="text-[11px] text-ink-500">MTN, Moov, Orange Money</p>
            </div>
            <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={14} className="text-white" />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-ink-200 px-3.5 py-3">
            <div className="w-9 h-9 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
              <CreditCard size={17} className="text-ink-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-900">Carte bancaire</p>
              <p className="text-[11px] text-ink-500">Visa, Mastercard</p>
            </div>
          </div>

          <button
            type="button"
            tabIndex={-1}
            className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium mt-3 flex items-center justify-center gap-2"
          >
            Payer 25 000 XOF
          </button>

          <p className="text-center text-[11px] text-ink-400 pt-1">Sécurisé par Verzapay</p>
        </div>
      </div>

      {/* Badge flottant succès */}
      <div className="absolute -right-3 sm:-right-6 top-1/3 bg-white rounded-xl border border-success-500/30 shadow-popover px-3.5 py-2.5 flex items-center gap-2 animate-fade-in">
        <div className="w-6 h-6 rounded-full bg-success-50 flex items-center justify-center shrink-0">
          <CheckCircle2 size={14} className="text-success-700" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-ink-900">Paiement reçu</p>
          <p className="text-[10px] text-ink-500">il y a 2 sec</p>
        </div>
      </div>
    </div>
  );
}
