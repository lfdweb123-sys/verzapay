import Image from "next/image";
import Link from "next/link";
import { Smartphone, ShieldCheck, Landmark, Code2, Lock, MessageCircle, BadgeCheck, CheckCircle2 } from "lucide-react";
import { CountryCount } from "@/components/marketing/country-count";
import { LiveStatusPill } from "@/components/marketing/live-status-pill";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getNetworkBrand } from "@/lib/network-brands";

const FEATURES = [
  { icon: Smartphone, title: "Mobile Money et carte bancaire", text: "Vos clients paient avec leur moyen habituel, dans chaque pays couvert." },
  { icon: ShieldCheck, title: "Page de paiement sécurisée", text: "Une page aux couleurs de Verzapay, confirmée côté serveur avant tout crédit." },
  { icon: Landmark, title: "Décaissements et virements", text: "Envoyez de l'argent à vos bénéficiaires, avec suivi et remboursements." },
  { icon: Code2, title: "API, webhooks et documentation", text: "Intégrez Verzapay à votre site ou à votre boutique en quelques étapes." },
];

const NETWORKS = [
  getNetworkBrand("MTN", "MTN MoMo"),
  getNetworkBrand("ORANGE", "Orange Money"),
  getNetworkBrand("MOOV", "Moov Africa"),
  getNetworkBrand("WAVE", "Wave"),
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* Formulaire */}
      <div className="relative flex-1 flex flex-col justify-center items-center px-6 sm:px-10 py-10 lg:py-0">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-[400px]">{children}</div>
      </div>

      {/* Panneau de présentation */}
      <aside
        className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center p-12 text-white"
        style={{ background: "linear-gradient(145deg, #0B2A7A 0%, #1D4ED8 55%, #2563EB 100%)" }}
      >
        {/* Décor : halos et grille discrète */}
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full opacity-30" style={{ background: "radial-gradient(circle, #60A5FA 0%, transparent 65%)" }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 w-[560px] h-[560px] rounded-full opacity-25" style={{ background: "radial-gradient(circle, #38BDF8 0%, transparent 65%)" }} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)", backgroundSize: "48px 48px", WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)" }}
        />

        <div className="relative z-10 w-full max-w-[460px] flex flex-col gap-9">
          {/* Marque + promesse */}
          <div className="space-y-5">
            <Link href="/" className="inline-block"><Image src="/icons/verzapay.png" alt="Verzapay" width={150} height={40} className="h-9 w-auto brightness-0 invert" priority /></Link>
            <h2 className="text-[30px] leading-[1.15] font-medium tracking-tight">Encaissez et envoyez de l&apos;argent, partout en Afrique.</h2>
            <p className="text-[15px] leading-relaxed text-white/75">
              Une seule plateforme pour accepter les paiements de vos clients et régler vos bénéficiaires, avec une sécurité de niveau bancaire.
            </p>
          </div>

          {/* Aperçu produit (exemple illustratif) */}
          <div className="relative">
            <div className="rounded-2xl bg-white text-ink-900 p-5 shadow-[0_24px_60px_-20px_rgba(2,6,23,0.55)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-500">Paiement reçu</p>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: "#DCFCE7", color: "#15803D" }}>
                  <CheckCircle2 size={12} /> Confirmé
                </span>
              </div>
              <p className="mt-2 text-[26px] font-medium tabular-nums tracking-tight">25 000 <span className="text-base text-ink-500 font-normal">FCFA</span></p>
              <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: NETWORKS[0].bg, color: NETWORKS[0].fg }}>{NETWORKS[0].mark}</span>
                  <div className="leading-tight">
                    <p className="text-sm font-medium">Mobile Money</p>
                    <p className="text-xs text-ink-500">Client · +229 •• •• •• 57</p>
                  </div>
                </div>
                <p className="text-xs text-ink-400">Exemple</p>
              </div>
            </div>
            {/* Réseaux pris en charge (pastilles) */}
            <div className="absolute -bottom-5 right-5 flex -space-x-2 rounded-full bg-white/95 px-2.5 py-1.5 shadow-lg">
              {NETWORKS.map((n) => (
                <span key={n.id} title={n.label} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: n.bg, color: n.fg }}>{n.mark.slice(0, 4)}</span>
              ))}
            </div>
          </div>

          {/* Atouts */}
          <ul className="space-y-4 pt-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center"><f.icon size={19} /></span>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-[13px] leading-relaxed text-white/65">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Confiance */}
          <div className="space-y-3.5 pt-5 border-t border-white/15">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/80">
              <span className="inline-flex items-center gap-1.5"><BadgeCheck size={14} /> Entreprises vérifiées</span>
              <span className="inline-flex items-center gap-1.5"><Lock size={14} /> Paiements chiffrés</span>
              <span className="inline-flex items-center gap-1.5"><MessageCircle size={14} /> Support WhatsApp</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-white"><CountryCount /> couverts</span>
            </div>
            <LiveStatusPill />
          </div>
        </div>
      </aside>
    </div>
  );
}
