import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Accès non autorisé — Verzapay" };

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-ink-50 px-4">
      <div className="max-w-md w-full bg-white border border-ink-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-14 h-14 rounded-full bg-danger-50 flex items-center justify-center mx-auto">
          <ShieldAlert size={28} className="text-danger-700" />
        </div>
        <h1 className="mt-5 text-xl font-medium text-ink-900">Vous n&apos;êtes pas autorisé</h1>
        <p className="mt-2 text-sm text-ink-500 leading-relaxed">
          Cette page n&apos;est accessible qu&apos;après validation de la vérification d&apos;identité de votre entreprise.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <Link href="/kyc-pending" className="btn-primary">Vérifier mon identité</Link>
          <Link href="/dashboard" className="btn-secondary">Retour au tableau de bord</Link>
        </div>
      </div>
    </main>
  );
}
