"use client";

import { usePreferences, type Currency, type ThemeMode } from "@/lib/preferences-context";
import { useToast } from "@/components/ui/toast";
import { Loader2, Sun, Moon, Monitor, DollarSign } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const CURRENCIES: { value: Currency; label: string; symbol: string; description: string }[] = [
  { value: "XOF", label: "Franc CFA (XOF)", symbol: "XOF", description: "Devise principale UEMOA/CEMAC" },
  { value: "USD", label: "Dollar américain (USD)", symbol: "$", description: "Conversion approximative" },
  { value: "EUR", label: "Euro (EUR)", symbol: "€", description: "Taux fixe BCEAO — 1 EUR = 655,957 XOF" },
];

const THEMES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
];

export function DisplaySettings() {
  const { currency, setCurrency, themeMode, setThemeMode, formatAmount } = usePreferences();
  const { show } = useToast();
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  async function handleCurrencyChange(c: Currency) {
    setSavingCurrency(true);
    try {
      await setCurrency(c);
      show(`Devise changée en ${c}`, "success");
    } catch {
      show("Erreur lors du changement de devise", "error");
    } finally {
      setSavingCurrency(false);
    }
  }

  async function handleThemeChange(m: ThemeMode) {
    setSavingTheme(true);
    try {
      await setThemeMode(m);
      show("Thème mis à jour", "success");
    } catch {
      show("Erreur lors du changement de thème", "error");
    } finally {
      setSavingTheme(false);
    }
  }

  return (
    <>
      {/* Devise */}
      <div className="card-base p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <DollarSign size={18} className="text-brand-700" />
          <p className="font-medium text-ink-900">Devise d&apos;affichage</p>
        </div>
        <p className="text-sm text-ink-500">
          Les montants de cette entreprise seront convertis et affichés dans la devise choisie. Chaque entreprise a sa propre devise : changer celle-ci ne modifie pas vos autres entreprises.
          Exemple : {formatAmount(10000)}
        </p>
        {savingCurrency && <Loader2 size={14} className="animate-spin text-brand-700" />}
        <div className="space-y-2">
          {CURRENCIES.map((c) => (
            <button
              key={c.value}
              onClick={() => handleCurrencyChange(c.value)}
              disabled={savingCurrency}
              className={cn(
                "w-full flex items-center justify-between rounded-xl border px-4 py-3 transition-colors text-left",
                currency === c.value
                  ? "border-brand-700 bg-brand-50"
                  : "border-ink-200 hover:bg-ink-50"
              )}
            >
              <div>
                <p className={cn("text-sm font-medium", currency === c.value ? "text-brand-800" : "text-ink-900")}>
                  {c.symbol} — {c.label}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">{c.description}</p>
              </div>
              {currency === c.value && (
                <div className="w-4 h-4 rounded-full bg-brand-700 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Thème */}
      <div className="card-base p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Monitor size={18} className="text-brand-700" />
          <p className="font-medium text-ink-900">Thème de l&apos;interface</p>
        </div>
        {savingTheme && <Loader2 size={14} className="animate-spin text-brand-700" />}
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleThemeChange(t.value)}
              disabled={savingTheme}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border py-4 transition-colors",
                themeMode === t.value
                  ? "border-brand-700 bg-brand-50 text-brand-800"
                  : "border-ink-200 text-ink-600 hover:bg-ink-50"
              )}
            >
              <t.icon size={20} />
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-400">
          Le mode sombre nécessite que Tailwind soit configuré avec la stratégie <code className="font-mono">class</code>.
          Si l&apos;interface ne change pas immédiatement, rechargez la page.
        </p>
      </div>
    </>
  );
}