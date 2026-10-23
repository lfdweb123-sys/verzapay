"use client";

import { AuthProvider } from "@/lib/auth-context";
import { CompanyProvider } from "@/lib/company-context";
import { ToastProvider } from "@/components/ui/toast";
import { ConsoleGuard } from "@/components/console-guard";
import { AuthFetch } from "@/components/auth-fetch";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConsoleGuard />
      <AuthFetch />
      <AuthProvider>
        <CompanyProvider>{children}</CompanyProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
