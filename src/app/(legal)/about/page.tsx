import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import { ShieldCheck, Smartphone, Users } from "lucide-react";

export default function AboutPage() {
  return (
    <article className="prose-verzapay">
      <LegalPageHeader
        title="À propos de Verzapay"
        subtitle="Verzapay est une plateforme d'encaissement et de décaissement pensée pour les marchands d'Afrique de l'Ouest."
      />

      <div className="space-y-6 text-ink-700 text-[15px] leading-relaxed">
        <p>
          Verzapay est une plateforme de paiement présente en <strong>Europe, en Afrique et en Amérique</strong>.
        </p>
        <p>
          Notre mission est simple : permettre à tout marchand, quelle que soit sa taille, d&apos;accepter des paiements Mobile Money et carte bancaire en quelques minutes, sans complexité technique ni démarche administrative lourde.
        </p>
        <p>
          Nous avons construit Verzapay autour de trois convictions fortes :
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5 mt-8">
        <div className="rounded-xl border border-ink-200 p-5">
          <ShieldCheck size={20} className="text-brand-700" />
          <p className="font-medium text-ink-900 mt-3">La confiance d&apos;abord</p>
          <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">Chaque marchand est vérifié avant de pouvoir encaisser, pour protéger l&apos;ensemble de l&apos;écosystème.</p>
        </div>
        <div className="rounded-xl border border-ink-200 p-5">
          <Smartphone size={20} className="text-brand-700" />
          <p className="font-medium text-ink-900 mt-3">Le paiement local</p>
          <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">Mobile Money reste le moyen de paiement de référence en Afrique de l&apos;Ouest — nous le plaçons au centre de l&apos;expérience.</p>
        </div>
        <div className="rounded-xl border border-ink-200 p-5">
          <Users size={20} className="text-brand-700" />
          <p className="font-medium text-ink-900 mt-3">La simplicité</p>
          <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">Pas de jargon technique inutile : un marchand doit pouvoir encaisser son premier paiement en moins de 5 minutes.</p>
        </div>
      </div>

      <div className="mt-10 pt-8 border-t border-ink-100 text-ink-700 text-[15px] leading-relaxed space-y-4">
        <p className="font-medium text-ink-900">Informations légales de l&apos;exploitant</p>
        <ul className="space-y-1.5 text-sm text-ink-600">
          <li><strong>Dénomination :</strong> Verzapay</li>
          <li><strong>Catégorie :</strong> Établissement (Personne physique)</li>
          <li><strong>Régime fiscal :</strong> Micro et petites entreprises</li>
          <li><strong>Présence :</strong> Europe, Afrique et Amérique</li>
        </ul>
      </div>
    </article>
  );
}
