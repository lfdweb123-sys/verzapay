import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import { Lock, ShieldCheck, FileCheck2, Server, Eye } from "lucide-react";

const MEASURES = [
  { icon: Lock, title: "Chiffrement systématique", desc: "Toutes les communications avec nos serveurs sont chiffrées en TLS. Aucune donnée sensible ne transite en clair." },
  { icon: ShieldCheck, title: "Vérification d'identité obligatoire", desc: "Chaque marchand est soumis à une vérification KYC (document, biométrie, AML) avant toute activation des paiements." },
  { icon: Server, title: "Isolation des données", desc: "Les informations financières de chaque entreprise sont strictement cloisonnées et inaccessibles aux autres marchands." },
  { icon: Eye, title: "Documents non conservés", desc: "Les pièces d'identité et selfies soumis lors du KYC sont traités en mémoire et ne sont jamais stockés sur nos serveurs." },
  { icon: FileCheck2, title: "Authentification renforcée", desc: "Une authentification à deux facteurs par email est disponible pour sécuriser l'accès à votre compte." },
];

export default function SecurityPage() {
  return (
    <article>
      <LegalPageHeader
        title="Sécurité & conformité"
        subtitle="La sécurité de vos fonds et de vos données est au cœur de la conception de Verzapay."
      />

      <div className="space-y-4">
        {MEASURES.map((m) => (
          <div key={m.title} className="flex gap-4 rounded-xl border border-ink-200 p-5">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <m.icon size={18} className="text-brand-700" />
            </div>
            <div>
              <p className="font-medium text-ink-900">{m.title}</p>
              <p className="text-sm text-ink-500 mt-1 leading-relaxed">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 pt-8 border-t border-ink-100 space-y-4 text-ink-700 text-[15px] leading-relaxed">
        <p className="font-medium text-ink-900">Signaler une vulnérabilité ou un incident</p>
        <p>
          Si vous identifiez une faille de sécurité ou un comportement suspect sur la plateforme, contactez-nous immédiatement via notre page de contact ou par email. Nous traitons les signalements de sécurité en priorité.
        </p>
      </div>
    </article>
  );
}
