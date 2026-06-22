import { LegalPageHeader } from "@/components/marketing/legal-page-header";

export default function KycPolicyPage() {
  return (
    <article className="text-ink-700 text-[15px] leading-relaxed space-y-8">
      <LegalPageHeader
        title="Politique KYC / AML"
        subtitle="Connaissance du client et lutte contre le blanchiment de capitaux"
        updatedAt="20 juin 2026"
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">1. Objectif</h2>
        <p>
          Verzapay applique une politique stricte de connaissance du client (« Know Your Customer », KYC) et de lutte contre le blanchiment de capitaux et le financement du terrorisme (« AML/CFT »), conformément aux exigences applicables en République du Bénin et dans l&apos;espace UEMOA.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">2. Vérification obligatoire</h2>
        <p>
          Aucun marchand ne peut encaisser ou recevoir de décaissement sur Verzapay sans avoir préalablement complété une vérification d&apos;identité. Cette vérification comprend :
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>La lecture et l&apos;authentification d&apos;une pièce d&apos;identité officielle (carte nationale d&apos;identité, passeport, permis de conduire) ;</li>
          <li>Une comparaison biométrique entre le document fourni et un selfie en direct ;</li>
          <li>La vérification du numéro de téléphone et de l&apos;adresse email associés au compte ;</li>
          <li>Un contrôle dans les listes de sanctions internationales et de personnes politiquement exposées (PEP).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">3. Décision et délais</h2>
        <p>
          La majorité des vérifications sont traitées automatiquement en quelques minutes. Lorsqu&apos;un dossier présente un niveau de risque nécessitant un examen complémentaire, une revue manuelle est effectuée, généralement sous 24 heures ouvrées. Le marchand est notifié de la décision par email et notification push.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">4. Rejet et nouvelle soumission</h2>
        <p>
          En cas de rejet, le marchand est informé du motif général du refus dans la mesure permise par la réglementation et peut soumettre une nouvelle vérification avec des documents corrigés ou complémentaires.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">5. Surveillance continue</h2>
        <p>
          Verzapay se réserve le droit de demander une nouvelle vérification, de suspendre temporairement un compte, ou de signaler une activité aux autorités compétentes en cas de transaction inhabituelle, de soupçon de fraude ou d&apos;activité potentiellement liée au blanchiment de capitaux.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">6. Conservation des justificatifs</h2>
        <p>
          Les images de documents et selfies soumis sont traitées en mémoire par notre partenaire de vérification d&apos;identité et ne sont pas stockées sous forme de fichier. Les résultats de vérification (statut, score de risque, identifiants) sont conservés conformément à nos obligations légales de tenue de registre.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink-900">7. Coopération avec les autorités</h2>
        <p>
          Verzapay coopère avec les autorités compétentes dans le cadre de la lutte contre le blanchiment de capitaux et le financement du terrorisme, dans le strict respect du cadre légal applicable.
        </p>
      </section>
    </article>
  );
}
