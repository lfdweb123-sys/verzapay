"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bug, LayoutDashboard, ArrowDownLeft, ArrowUpRight, CreditCard, Users,
  Wallet, Settings, Code2, LifeBuoy, ChevronLeft, ChevronRight,
  Plus, Check, ChevronsUpDown, Building2, BookOpen, LogOut,
  UsersRound, ShieldAlert, X, Store,
} from "lucide-react";
import { cn, initials, colorForName } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import type { Company } from "@/types";
import { isKycLocked, isAllowedWhenLocked } from "@/lib/kyc-lock";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  section?: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, section: "PRINCIPAL" },
  { href: "/payments", label: "Paiements entrants", icon: ArrowDownLeft },
  { href: "/payouts", label: "Paiements sortants", icon: ArrowUpRight },
  { href: "/transactions", label: "Transactions", icon: CreditCard },
  { href: "/customers", label: "Clients / fournisseurs", icon: Users },
  { href: "/wallets", label: "Portefeuilles", icon: Wallet },
  { href: "/shop", label: "Ma boutique", icon: Store },
  { href: "/team", label: "Équipe", icon: UsersRound, section: "ORGANISATION" },
  { href: "/developers", label: "Développeur", icon: Code2, section: "SYSTÈME" },
  { href: "/settings", label: "Paramètres", icon: Settings },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/bug-report", label: "Signaler un bug", icon: Bug },
];

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, appUser, logout } = useAuth();
  const { companies, activeCompany, setActiveCompanyId } = useCompany();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isAdmin = Boolean((appUser as { isAdmin?: boolean } | null)?.isAdmin);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  const navList = isAdmin
    ? [...NAV, { href: "/admin", label: "Administration", icon: ShieldAlert, section: "ADMIN" }]
    : NAV;

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-white border-r border-ink-200 transition-all duration-300 overflow-hidden",
          // Desktop : largeur selon collapsed, toujours visible
          collapsed ? "lg:w-[76px]" : "lg:w-[260px]",
          // Mobile : drawer plein, translate selon mobileOpen
          "w-[280px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-ink-200 shrink-0">
          {collapsed ? (
            <div className="hidden lg:flex w-9 h-9 rounded-xl bg-brand-700 items-center justify-center mx-auto">
              <span className="text-white font-bold text-sm">V</span>
            </div>
          ) : (
            <Logo size="md" />
          )}
          {collapsed && (
            <div className="lg:hidden">
              <Logo size="md" />
            </div>
          )}
          <button
            onClick={onMobileClose}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Company picker */}
        <div className="px-3 py-3 border-b border-ink-200 shrink-0 relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-ink-100 transition-colors",
              collapsed && "lg:justify-center"
            )}
          >
            {activeCompany ? (
              <CompanyAvatar company={activeCompany} size={collapsed ? 32 : 28} />
            ) : (
              <div className="w-7 h-7 rounded-md bg-ink-200 flex items-center justify-center shrink-0">
                <Building2 size={14} className="text-ink-500" />
              </div>
            )}
            <div className={cn("flex-1 min-w-0 text-left", collapsed && "lg:hidden")}>
              <p className="text-sm font-medium text-ink-900 truncate">{activeCompany?.name ?? "—"}</p>
              <p className="text-[11px] text-ink-500">
                {activeCompany?.kycStatus === "approved" ? "Vérifié" :
                  activeCompany?.kycStatus === "pending" ? "KYC en analyse" :
                  activeCompany?.kycStatus === "review" ? "KYC en révision" :
                  activeCompany?.kycStatus === "awaiting_submission" ? "Documents à soumettre" :
                  activeCompany?.kycStatus === "rejected" ? "KYC rejeté" : "KYC requis"}
              </p>
            </div>
            <ChevronsUpDown size={14} className={cn("text-ink-400 shrink-0", collapsed && "lg:hidden")} />
          </button>

          {pickerOpen && (
            <div
              className={cn(
                "absolute top-full mt-1 bg-white border border-ink-200 rounded-xl shadow-popover z-50 overflow-hidden animate-slide-up",
                // Réduit (desktop) : panneau étroit, on l'ouvre vers la droite, largeur fixe
                // Déployé / mobile : pleine largeur de la sidebar
                collapsed ? "left-3 lg:left-full lg:ml-2 lg:top-0 w-64 right-3 lg:right-auto" : "left-3 right-3"
              )}
            >
              <div className="px-3 py-2 border-b border-ink-100">
                <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Mes entreprises</p>
              </div>
              <div className="py-1 max-h-[60vh] overflow-y-auto scrollbar-none overscroll-contain">
                {companies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setActiveCompanyId(c.id); setPickerOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50 transition-colors"
                  >
                    <CompanyAvatar company={c} size={26} />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-ink-900 truncate">{c.name}</p>
                      {c.role && <p className="text-[11px] text-ink-500">{c.role}</p>}
                    </div>
                    {activeCompany?.id === c.id && <Check size={14} className="text-brand-600 shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-ink-100 py-1">
                <Link
                  href="/companies/new"
                  onClick={() => setPickerOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-md border border-dashed border-ink-300 flex items-center justify-center">
                    <Plus size={12} className="text-ink-400" />
                  </div>
                  Créer une entreprise
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin-visible px-2 py-3 space-y-0.5">
          {navList.map((item, idx) => {
            const prev = navList[idx - 1];
            const showSection = item.section && item.section !== prev?.section;
            const disabled = isKycLocked(activeCompany) && !isAllowedWhenLocked(item.href);
            return (
              <div key={item.href}>
                {showSection && (
                  <p className={cn("text-[10px] font-semibold text-ink-400 uppercase tracking-wider px-2 pt-4 pb-1", collapsed && "lg:hidden")}>
                    {item.section}
                  </p>
                )}
                {showSection && (
                  <div className={cn("hidden", collapsed && "lg:block my-2 mx-2 h-px bg-ink-100")} />
                )}
                {disabled ? (
                  <span
                    aria-disabled="true"
                    title="Vérification d'identité requise"
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-400 opacity-50 cursor-not-allowed select-none",
                      collapsed && "lg:justify-center lg:px-2"
                    )}
                  >
                    <item.icon size={18} />
                    <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
                  </span>
                ) : (
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    collapsed && "lg:justify-center lg:px-2",
                    isActive(item.href)
                      ? "bg-brand-50 text-brand-800 font-medium"
                      : item.section === "ADMIN"
                      ? "text-warning-700 hover:bg-warning-50"
                      : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                  )}
                >
                  <item.icon size={18} className={isActive(item.href) ? "text-brand-700" : ""} />
                  <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
                </Link>
                )}
              </div>
            );
          })}
        </nav>

        {/* Lien documentation, juste avant le profil */}
        <div className="shrink-0 border-t border-ink-200 px-2 py-2">
          <Link
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? "Documentation" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900 transition-colors",
              collapsed && "lg:justify-center lg:px-2"
            )}
          >
            <BookOpen size={18} />
            <span className={cn(collapsed && "lg:hidden")}>Documentation</span>
          </Link>
        </div>

        {/* User footer + déconnexion bien visible */}
        <div className="shrink-0 border-t border-ink-200 px-3 py-3 space-y-2">
          <button
            onClick={handleLogout}
            title={collapsed ? "Déconnexion" : undefined}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-danger-700 bg-danger-50 hover:bg-danger-100 transition-colors",
              collapsed && "lg:justify-center lg:px-2"
            )}
          >
            <LogOut size={16} />
            <span className={cn(collapsed && "lg:hidden")}>Déconnexion</span>
          </button>
        </div>

        {/* Collapse button (desktop uniquement) */}
        <button
          onClick={() => onCollapse(!collapsed)}
          className="hidden lg:flex absolute -right-3.5 top-20 w-7 h-7 rounded-full bg-white border border-ink-200 items-center justify-center shadow-card hover:bg-ink-50 transition-colors z-10"
          aria-label={collapsed ? "Développer la sidebar" : "Réduire la sidebar"}
        >
          {collapsed ? <ChevronRight size={14} className="text-ink-500" /> : <ChevronLeft size={14} className="text-ink-500" />}
        </button>
      </aside>
    </>
  );
}

function CompanyAvatar({ company, size }: { company: Company; size: number }) {
  const color = company.logoColor ?? colorForName(company.name);
  const s = size + "px";
  return (
    <div
      className="rounded-lg flex items-center justify-center shrink-0 text-white font-semibold"
      style={{ width: s, height: s, background: color, fontSize: Math.max(9, size * 0.38) + "px" }}
    >
      {initials(company.name)}
    </div>
  );
}
