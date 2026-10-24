"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ArrowDownLeft, ArrowUpRight, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company-context";
import { isKycLocked, isAllowedWhenLocked } from "@/lib/kyc-lock";

const TABS = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/payments", label: "Entrants", icon: ArrowDownLeft },
  { href: "/payouts", label: "Sortants", icon: ArrowUpRight },
  { href: "/customers", label: "Clients", icon: Users },
  { href: "/settings", label: "Réglages", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const { activeCompany } = useCompany();
  const locked = isKycLocked(activeCompany);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-white border-t border-ink-200 flex lg:hidden">
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        if (locked && !isAllowedWhenLocked(tab.href)) {
          return (
            <span key={tab.href} aria-disabled="true" className="flex-1 flex flex-col items-center justify-center gap-1 text-[11px] text-ink-300 opacity-50 cursor-not-allowed">
              <tab.icon size={20} strokeWidth={1.8} />
              <span className="font-medium">{tab.label}</span>
            </span>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors",
              active ? "text-brand-700" : "text-ink-500"
            )}
          >
            <tab.icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span className="font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
