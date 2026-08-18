"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { useInactivityLogout } from "@/hooks/use-inactivity-logout";
import { InactivityWarningModal } from "@/components/layout/inactivity-warning-modal";
import { useToast } from "@/components/ui/toast";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, appUser, loading, twoFactorVerified, logout } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const isAdmin = Boolean((appUser as { isAdmin?: boolean } | null)?.isAdmin);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/"); return; }
    const requires2FA = appUser?.twoFactorEnabled !== false;
    if (requires2FA && !twoFactorVerified) { router.replace("/verify-2fa"); return; }
    if (!isAdmin) { router.replace("/dashboard"); return; }
  }, [user, appUser, loading, twoFactorVerified, isAdmin, router]);

  const handleInactivityLogout = useCallback(async () => {
    await logout();
    show("Vous avez été déconnecté(e) après 30 minutes d'inactivité.", "info");
    router.replace("/");
  }, [logout, router, show]);

  const { showWarning, secondsLeft, stayActive } = useInactivityLogout(handleInactivityLogout, Boolean(user) && isAdmin);

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-900">
        <Loader2 className="animate-spin text-white" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <AdminSidebar />
      <main className="lg:pl-[260px] min-h-screen">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fade-in pt-16 lg:pt-6">{children}</div>
      </main>
      <InactivityWarningModal open={showWarning} secondsLeft={secondsLeft} onContinue={stayActive} />
    </div>
  );
}
