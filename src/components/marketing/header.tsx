"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

const NAV_LINKS = [
  { href: "/#fonctionnement", label: "Fonctionnement" },
  { href: "/#paiements", label: "Paiements" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/#faq", label: "FAQ" },
];

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled ? "bg-white/90 backdrop-blur-md border-b border-ink-200" : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/">
          <Image src="/icons/verzapay.png" alt="Verzapay" width={200} height={52} priority className="h-12 w-auto" />
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-ink-600 hover:text-ink-900 font-medium transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login" className="text-sm font-medium text-ink-700 hover:text-ink-900 px-3 py-2">
            Se connecter
          </Link>
          <Link href="/register" className="btn-primary h-10 text-sm">
            Créer un compte
            <ArrowRight size={15} />
          </Link>
        </div>

        <button onClick={() => setMobileOpen((v) => !v)} className="lg:hidden w-9 h-9 flex items-center justify-center text-ink-700">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Menu mobile */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-ink-200 px-5 py-4 space-y-1 animate-slide-up">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-3 mt-2 border-t border-ink-100 flex flex-col gap-2">
            <LanguageSwitcher className="self-start" />
            <Link href="/login" className="btn-secondary w-full">Se connecter</Link>
            <Link href="/register" className="btn-primary w-full">Créer un compte gratuit</Link>
          </div>
        </div>
      )}
    </header>
  );
}
