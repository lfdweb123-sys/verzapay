"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { getLang, setLang } from "@/components/i18n/auto-translate";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const [lang, setLangState] = useState<"fr" | "en">("fr");
  useEffect(() => { setLangState(getLang()); }, []);

  function choose(l: "fr" | "en") {
    setLangState(l);
    setLang(l);
  }

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border border-ink-200 p-0.5 text-xs notranslate", className)} translate="no" aria-label="Langue">
      <Globe size={13} className="mx-1.5 text-ink-400" />
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l} type="button" onClick={() => choose(l)}
          className={cn("px-2 py-1 rounded-md font-medium uppercase transition-colors", lang === l ? "bg-brand-700 text-white" : "text-ink-600 hover:bg-ink-50")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
