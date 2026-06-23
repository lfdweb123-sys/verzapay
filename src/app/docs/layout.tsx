"use client";

import { useState, useEffect, useCallback, createContext } from "react";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

export const DocsDarkContext = createContext<{
  dark: boolean;
  toggle: () => void;
}>({ dark: false, toggle: () => {} });

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("verzapay-docs-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(stored ? stored === "dark" : prefersDark);
  }, []);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("verzapay-docs-theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  return (
    <DocsDarkContext.Provider value={{ dark, toggle }}>
      <div
        id="docs-root"
        style={{
          backgroundColor: dark ? "#09090b" : "#ffffff",
          color: dark ? "#f4f4f5" : "#1A1A19",
        }}
        className="min-h-screen flex flex-col transition-colors duration-200"
      >
        <MarketingHeader />
        <main className="flex-1 pt-24 pb-20">{children}</main>
        <MarketingFooter />
      </div>
    </DocsDarkContext.Provider>
  );
}