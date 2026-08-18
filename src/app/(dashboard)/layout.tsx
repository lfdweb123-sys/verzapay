"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { FcmInit } from "@/components/layout/fcm-init";
import { InactivityWarningModal } from "@/components/layout/inactivity-warning-modal";
import { useAuth } from "@/lib/auth-context";
import { useInactivityLogout } from "@/hooks/use-inactivity-logout";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { PreferencesProvider } from "@/lib/preferences-context";
import { CompanyProvider } from "@/lib/company-context";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, appUser, loading, twoFactorVerified, logout } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Appliquer le thème utilisateur
  useEffect(() => {
    const theme = appUser?.theme ?? "light";

    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [appUser?.theme]);

  // Garde d'authentification, 2FA et redirection des admins
  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/");
      return;
    }

    const requires2FA = appUser?.twoFactorEnabled !== false;
    if (requires2FA && !twoFactorVerified) {
      router.replace("/verify-2fa");
      return;
    }

    // Rediriger les admins vers /admin s'ils tentent d'accéder au dashboard marchand
    const isAdmin = Boolean((appUser as { isAdmin?: boolean } | null)?.isAdmin);
    if (isAdmin) {
      router.replace("/admin");
      return;
    }
  }, [user, appUser, loading, twoFactorVerified, router]);

  // Fermer le menu mobile lors d'un changement de page
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleInactivityLogout = useCallback(async () => {
    await logout();
    show(
      "Vous avez été déconnecté(e) après 30 minutes d'inactivité.",
      "info"
    );
    router.replace("/login");
  }, [logout, router, show]);

  const { showWarning, secondsLeft, stayActive } =
    useInactivityLogout(handleInactivityLogout, Boolean(user));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-ink-900">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }

  if (!user) return null;

  const isAdminUser = Boolean((appUser as { isAdmin?: boolean } | null)?.isAdmin);
  if (isAdminUser) return null; // l'useEffect ci-dessus gère la redirection

  const requires2FA = appUser?.twoFactorEnabled !== false;
  if (requires2FA && !twoFactorVerified) return null;

  return (
    <PreferencesProvider>
      <CompanyProvider>
        <div className="min-h-screen bg-ink-50 dark:bg-ink-900">
          <Sidebar
            collapsed={collapsed}
            onCollapse={setCollapsed}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />

          <DashboardHeader
            sidebarCollapsed={collapsed}
            onMenuClick={() => setMobileOpen(true)}
          />

          <main
            className={cn(
              "pt-16 pb-20 lg:pb-6 min-h-screen transition-all duration-300",
              "lg:pl-[260px]",
              collapsed && "lg:pl-[76px]"
            )}
          >
            <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fade-in">
              {children}
            </div>
          </main>

          <BottomNav />
          <FcmInit />

          <InactivityWarningModal
            open={showWarning}
            secondsLeft={secondsLeft}
            onContinue={stayActive}
          />
        </div>
      </CompanyProvider>
    </PreferencesProvider>
  );
}