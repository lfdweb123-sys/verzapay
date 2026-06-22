import { LegalPageHeader } from "@/components/marketing/legal-page-header";
import { ContactForm } from "@/components/contact-form";

export default function PublicContactPage() {
  return (
    <article>
      <LegalPageHeader
        title="Contactez-nous"
        subtitle="Une question, un projet d'intégration, un partenariat ? Notre équipe vous répond rapidement."
      />
      <ContactForm source="contact" />
    </article>
  );
}
