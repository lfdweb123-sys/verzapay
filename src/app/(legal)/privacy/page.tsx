import { LegalPageHeader } from "@/components/marketing/legal-page-header";

export default function PrivacyPage() {
  return (
    <article className="text-ink-700 text-[15px] leading-relaxed space-y-8">
      <LegalPageHeader
        title="Politique de confidentialité"
        updatedAt="20 juin 2026"
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">1. Responsable du traitement</h2>
        <p>
          Le responsable du traitement des données collectées via Verzapay est <strong>Verzapay</strong>, présent en Europe, en Afrique et en Amérique.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">2. Données collectées</h2>
        <p>Nous collectons les catégories de données suivantes :</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Données d&apos;identification :</strong> nom, prénom, email, numéro de téléphone</li>
          <li><strong>Données de vérification d&apos;identité (KYC) :</strong> document d&apos;identité, photo de selfie, données extraites du document (traitées par notre partenaire de vérification, jamais stockées en tant qu&apos;images sur nos serveurs)</li>
          <li><strong>Données d&apos;entreprise :</strong> numéro IFU, numéro RCCM, secteur d&apos;activité, adresse</li>
          <li><strong>Données de transaction :</strong> montants, dates, statuts de paiement, informations sur les clients de nos marchands (nom, téléphone) strictement nécessaires au traitement des paiements</li>
          <li><strong>Données techniques :</strong> adresse IP, identifiants de session, jetons de notification push</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">3. Finalités du traitement</h2>
        <p>Vos données sont traitées pour :</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Créer et gérer votre compte marchand ;</li>
          <li>Vérifier votre identité conformément à nos obligations de conformité (KYC/AML) ;</li>
          <li>Traiter les paiements et décaissements que vous initiez ;</li>
          <li>Vous envoyer des notifications relatives à votre activité (email, push) ;</li>
          <li>Assurer la sécurité de la plateforme et prévenir la fraude ;</li>
          <li>Répondre à vos demandes de support.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">4. Partage des données</h2>
        <p>
          Vos données peuvent être partagées avec nos partenaires techniques strictement nécessaires à la fourniture du service : prestataire de vérification d&apos;identité, partenaires de traitement des paiements, prestataire d&apos;envoi d&apos;emails transactionnels. Ces partenaires sont contractuellement tenus de protéger vos données et ne peuvent les utiliser à d&apos;autres fins.
        </p>
        <p>
          Nous ne vendons ni ne louons vos données personnelles à des tiers à des fins commerciales.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">5. Conservation des données</h2>
        <p>
          Les documents d&apos;identité et selfies soumis lors du processus KYC sont traités en mémoire par notre partenaire de vérification et ne sont pas conservés sous forme d&apos;image. Les données de transaction sont conservées pendant la durée nécessaire au respect de nos obligations légales et comptables.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">6. Vos droits</h2>
        <p>
          Conformément à la réglementation applicable en matière de protection des données personnelles, vous disposez d&apos;un droit d&apos;accès, de rectification et, dans certaines limites liées à nos obligations légales de conservation, de suppression de vos données. Vous pouvez exercer ces droits en nous contactant via notre page de contact.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">7. Sécurité</h2>
        <p>
          Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données contre tout accès non autorisé, perte ou divulgation, incluant le chiffrement des communications et le cloisonnement des données entre marchands.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">8. Contact</h2>
        <p>
          Pour toute question relative à cette politique ou à l&apos;exercice de vos droits, contactez-nous via notre page de contact.
        </p>
      </section>
    </article>
  );
}
