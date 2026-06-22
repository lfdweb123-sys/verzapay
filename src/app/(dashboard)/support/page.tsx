import { ContactForm } from "@/components/contact-form";

export default function SupportPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Support</h1>
        <p className="text-sm text-ink-500">Une question, un problème ? Notre équipe vous répond rapidement.</p>
      </div>
      <ContactForm source="support" />
    </div>
  );
}
