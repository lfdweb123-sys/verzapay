"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startAutoTranslate } from "@/lib/i18n-engine";

export { getLang, setLang } from "@/lib/i18n-engine";

/** Traduction automatique FR → EN de tout le site (voir lib/i18n-engine.ts). Relancée à chaque changement de page. */
export function AutoTranslate() {
  const pathname = usePathname();
  useEffect(() => startAutoTranslate(), [pathname]);
  return null;
}
