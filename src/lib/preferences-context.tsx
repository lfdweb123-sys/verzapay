"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export type Currency = "XOF" | "USD" | "EUR";
export type ThemeMode = "system" | "light" | "dark";

// Taux de conversion approximatifs (XOF est la devise de base)
// En production, ces taux devraient être rafraîchis via une API de taux de change
const RATES: Record<Currency, number> = {
  XOF: 1,
  USD: 1 / 655.957, // 1 USD ≈ 655.957 XOF (taux BCEAO fixe EUR/XOF, USD approx)
  EUR: 1 / 655.957, // 1 EUR = 655.957 XOF (taux BCEAO fixe)
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
  const [currency, setCurrencyState] = useState<Currency>("XOF");
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  // Charger les préférences depuis Firestore
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.currency) setCurrencyState(data.currency as Currency);
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
    setCurrencyState(c);
    if (user) await updateDoc(doc(db, "users", user.uid), { currency: c });
  }

  async function setThemeMode(m: ThemeMode) {
    setThemeModeState(m);
    if (user) await updateDoc(doc(db, "users", user.uid), { themeMode: m });
  }

  function formatAmount(xofAmount: number): string {
    const converted = xofAmount * RATES[currency];
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