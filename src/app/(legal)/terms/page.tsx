import { LegalPageHeader } from "@/components/marketing/legal-page-header";

export default function TermsPage() {
  return (
    <article className="text-ink-700 text-[15px] leading-relaxed space-y-8">
      <LegalPageHeader
        title="Conditions d'utilisation"
        updatedAt="20 juin 2026"
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">1. Éditeur de la plateforme</h2>
        <p>
          La plateforme Verzapay est éditée et exploitée par <strong>La Faveur Infinie de Dieu</strong>, établissement de droit béninois immatriculé au Registre du Commerce et du Crédit Mobilier de Cotonou sous le numéro <strong>RB/ABC/24 A 112271</strong> en date du 28 août 2024, identifié fiscalement sous le numéro IFU <strong>0202214354454</strong>, dont le siège est situé à Akassato, Abomey-Calavi, Atlantique, République du Bénin.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">2. Objet</h2>
        <p>
          Verzapay est une plateforme technologique permettant à des marchands (« vous », « le Marchand ») de créer un compte afin d&apos;encaisser des paiements auprès de leurs propres clients via Mobile Money et carte bancaire, et de demander le reversement des fonds correspondants déduction faite d&apos;une commission.
        </p>
        <p>
          Verzapay agit en qualité d&apos;intermédiaire technique et n&apos;est pas elle-même un établissement de monnaie électronique ou une banque. Les opérations de paiement et de décaissement sont exécutées par l&apos;intermédiaire de partenaires de paiement agréés.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">3. Inscription et vérification d&apos;identité</h2>
        <p>
          L&apos;accès aux fonctionnalités d&apos;encaissement et de décaissement est conditionné à la complétion d&apos;une procédure de vérification d&apos;identité (KYC). Verzapay se réserve le droit de refuser, suspendre ou clôturer tout compte ne satisfaisant pas aux exigences de conformité applicables.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">4. Commission</h2>
        <p>
          Une commission est prélevée sur chaque paiement encaissé avec succès, au taux affiché dans votre tableau de bord au moment de la transaction. Aucune commission n&apos;est prélevée sur les paiements échoués ou annulés.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">5. Obligations du Marchand</h2>
        <p>Le Marchand s&apos;engage à :</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Fournir des informations exactes et à jour lors de son inscription et de sa vérification KYC ;</li>
          <li>Utiliser la plateforme exclusivement à des fins licites ;</li>
          <li>Ne pas utiliser Verzapay pour des activités frauduleuses, de blanchiment de capitaux ou de financement du terrorisme ;</li>
          <li>Conserver la confidentialité de ses identifiants et de sa clé API.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">6. Responsabilité</h2>
        <p>
          Verzapay met en œuvre des moyens raisonnables pour assurer la disponibilité et la sécurité de la plateforme, sans garantie d&apos;absence totale d&apos;interruption. Verzapay ne saurait être tenue responsable des pertes résultant d&apos;une mauvaise utilisation de la plateforme par le Marchand ou d&apos;un manquement de ce dernier à ses obligations légales.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">7. Suspension et résiliation</h2>
        <p>
          Verzapay peut suspendre ou résilier l&apos;accès d&apos;un Marchand en cas de violation des présentes conditions, de soupçon de fraude, ou sur demande des autorités compétentes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">8. Droit applicable</h2>
        <p>
          Les présentes conditions sont soumises au droit béninois. Tout litige relève de la compétence des juridictions de Cotonou, République du Bénin.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">9. Contact</h2>
        <p>
          Pour toute question relative aux présentes conditions, vous pouvez nous contacter via notre page de contact.
        </p>
      </section>
    </article>
  );
}
