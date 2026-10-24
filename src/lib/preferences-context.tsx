"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";

export type Currency = "XOF" | "USD" | "EUR";
export type ThemeMode = "system" | "light" | "dark";

// Taux de repli : seule la parité EUR/XOF est fixe (655,957). Le taux USD vient de /api/public/fx (API de taux de change) ;
// tant qu'il n'est pas chargé, les montants sont affichés en XOF plutôt qu'avec un taux inventé.
const FALLBACK_RATES: Partial<Record<Currency, number>> = {
  XOF: 1,
  EUR: 1 / 655.957,
};

const SYMBOLS: Record<Currency, string> = {
  XOF: "XOF",
  USD: "$",
  EUR: "€",
};

interface PreferencesContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => Promise<void>;
  formatAmount: (xofAmount: number) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  // Devise PAR ENTREPRISE : stockée sur le document de l'entreprise, jamais partagée entre
  // entreprises. Sans entreprise active (ex. espace admin), repli sur la préférence du compte.
  const [userCurrency, setUserCurrency] = useState<Currency>("XOF");
  const [optimistic, setOptimistic] = useState<{ companyId: string; value: Currency } | null>(null);
  const companyCurrency = (activeCompany?.currency as Currency | undefined) ?? userCurrency;
  const currency: Currency = activeCompany
    ? (optimistic && optimistic.companyId === activeCompany.id ? optimistic.value : companyCurrency)
    : userCurrency;
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [rates, setRates] = useState<Partial<Record<Currency, number>>>(FALLBACK_RATES);

  // Taux de change en direct (unités de chaque devise pour 1 XOF), rafraîchis toutes les heures côté serveur
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { rates?: Record<string, number> } | null) => {
        if (cancelled || !d?.rates) return;
        setRates({ XOF: 1, EUR: d.rates.EUR ?? FALLBACK_RATES.EUR, USD: d.rates.USD });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Charger les préférences depuis Firestore
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.currency) setUserCurrency(data.currency as Currency);
        if (data.themeMode) setThemeModeState(data.themeMode as ThemeMode);
      }
    });
    return unsub;
  }, [user]);

  // Appliquer le thème sur <html>
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else if (themeMode === "light") {
      root.classList.remove("dark");
    } else {
      // system
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.matches) root.classList.add("dark");
      else root.classList.remove("dark");
      const handler = (e: MediaQueryListEvent) => {
        if (themeMode === "system") {
          if (e.matches) root.classList.add("dark");
          else root.classList.remove("dark");
        }
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [themeMode]);

  async function setCurrency(c: Currency) {
    if (activeCompany) {
      setOptimistic({ companyId: activeCompany.id, value: c });
      await updateDoc(doc(db, "companies", activeCompany.id), { currency: c });
      return;
    }
    setUserCurrency(c);
    if (user) await updateDoc(doc(db, "users", user.uid), { currency: c });
  }

  async function setThemeMode(m: ThemeMode) {
    setThemeModeState(m);
    if (user) await updateDoc(doc(db, "users", user.uid), { themeMode: m });
  }

  function formatAmount(xofAmount: number): string {
    const rate = rates[currency];
    // Taux indisponible (ex. USD hors ligne) : on affiche en XOF, jamais avec un taux deviné.
    if (!rate) return `${Math.round(xofAmount).toLocaleString("fr-FR")} XOF`;
    const converted = xofAmount * rate;
    const symbol = SYMBOLS[currency];
    if (currency === "XOF") {
      return `${Math.round(converted).toLocaleString("fr-FR")} XOF`;
    }
    return `${symbol}${converted.toFixed(2)}`;
  }

  return (
    <PreferencesContext.Provider value={{ currency, setCurrency, themeMode, setThemeMode, formatAmount }}>
      {children}
    </PreferencesContext.Provider>
  );
}