import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FinalCta() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand-700 px-6 py-14 sm:px-14 sm:py-16 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-600/40 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-brand-800/50 blur-3xl"
          />

          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-medium text-white tracking-tight max-w-xl mx-auto">
              Prêt à encaisser votre premier paiement ?
            </h2>
            <p className="mt-4 text-brand-100 text-base max-w-md mx-auto">
              Créez votre compte gratuitement et commencez à accepter des paiements en moins de 5 minutes.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-lg bg-white text-brand-800 text-[15px] font-medium hover:bg-brand-50 transition-colors"
              >
                Créer un compte gratuit
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-lg border border-white/30 text-white text-[15px] font-medium hover:bg-white/10 transition-colors"
              >
                Se connecter
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}