"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ArrowDownLeft, ArrowUpRight, CreditCard, Users,
  Wallet, UsersRound, Building2, LogOut, ShieldAlert, X, Menu, Mail,
  MessageSquare, UserCog, Settings, Percent,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar } from "@/components/ui/user-avatar";

const ADMIN_NAV = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/companies", label: "Entreprises", icon: Building2 },
  { href: "/admin/merchants", label: "Marchands", icon: Users },
  { href: "/admin/payments", label: "Paiements entrants", icon: ArrowDownLeft },
  { href: "/admin/payouts", label: "Paiements sortants", icon: ArrowUpRight },
  { href: "/admin/transactions", label: "Transactions", icon: CreditCard },
  { href: "/admin/customers", label: "Clients / fournisseurs", icon: UsersRound },
  { href: "/admin/wallets", label: "Portefeuilles", icon: Wallet },
  { href: "/admin/commissions", label: "Commissions", icon: Percent },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare },
  { href: "/admin/email-requests", label: "Demandes d'email", icon: Mail },
  { href: "/admin/teams", label: "Équipe Verzapay", icon: UserCog },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, appUser, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <>
      {/* Bouton hamburger mobile */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-9 h-9 rounded-lg bg-white border border-ink-200 flex items-center justify-center shadow-card"
        aria-label="Ouvrir le menu admin"
      >
        <Menu size={18} className="text-ink-700" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 w-[260px] flex flex-col bg-ink-900 border-r border-ink-800 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-ink-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-danger-500 flex items-center justify-center">
              <ShieldAlert size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-medium leading-tight">Verzapay</p>
              <p className="text-ink-400 text-[10px] leading-tight">Espace Administration</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-ink-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-none px-2 py-3 space-y-0.5">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                isActive(item.href) ? "bg-white/10 text-white font-medium" : "text-ink-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-800 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2.5">
            <UserAvatar photoURL={appUser?.photoURL} name={appUser?.displayName ?? "Admin"} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{appUser?.displayName ?? "—"}</p>
              <p className="text-[11px] text-ink-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-white bg-danger-500/10 hover:bg-danger-500/20 transition-colors"
          >
            <LogOut size={16} />
            Déconnexion
          </button>
          <Link href="/dashboard" className="block text-center text-[11px] text-ink-500 hover:text-ink-300 pt-1">
            ← Retour à mon espace marchand
          </Link>
        </div>
      </aside>
    </>
  );
}