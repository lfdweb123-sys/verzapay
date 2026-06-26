"use client";

import { useState, useEffect, useCallback, createContext } from "react";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

export const DocsDarkContext = createContext<{
  dark: boolean;
  toggle: () => void;
}>({ dark: false, toggle: () => {} });

// Exécuté AVANT l'hydratation React, directement par le navigateur en tant
// que <script> bloquant. Lit localStorage/matchMedia et applique la classe
// "dark" sur #docs-root immédiatement — donc le tout premier paint visible
// (avant même que React ne s'exécute) a déjà la bonne couleur, qu'il vienne
// du HTML serveur (toujours clair par défaut) ou non. Ça évite la fenêtre où
// le navigateur peint en clair puis bascule en sombre, qui est la cause du
// flash ET du mismatch d'hydratation (React error #418) qu'on avait.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem("verzapay-docs-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = stored ? stored === "dark" : prefersDark;
    var el = document.getElementById("docs-root");
    if (el && dark) {
      el.style.backgroundColor = "#09090b";
      el.style.color = "#f4f4f5";
      el.dataset.theme = "dark";
    }
  } catch (e) {}
})();
`;

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  // Toujours `false` au tout premier rendu React (serveur ET client) — c'est
  // volontaire et c'est ce qui élimine le mismatch. Le script inline ci-dessus
  // s'occupe seul de l'état visuel "réel" avant que React ne prenne le relais ;
  // ce useState se resynchronise ensuite dans le useEffect, après coup, donc
  // sans jamais contredire un rendu déjà commité par le serveur.
  const [dark, setDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("verzapay-docs-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(stored ? stored === "dark" : prefersDark);
    setHydrated(true);
  }, []);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("verzapay-docs-theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  // Avant hydratation complète, on ne pilote pas encore les couleurs depuis
  // React (le script inline s'en charge). Une fois `hydrated` vrai, React
  // reprend totalement le contrôle visuel sans divergence possible puisque le
  // DOM a déjà été mis à jour de façon synchrone par le script, pas par React.
  const effectiveDark = hydrated ? dark : false;

  return (
    <DocsDarkContext.Provider value={{ dark: effectiveDark, toggle }}>
      {/* suppressHydrationWarning : le script inline ci-dessus modifie déjà
          le style/dataset de ce noeud avant l'hydratation. On dit explicitement
          à React de ne pas comparer cet attribut précis au rendu serveur. */}
      <div
        id="docs-root"
        suppressHydrationWarning
        style={{
          backgroundColor: effectiveDark ? "#09090b" : "#ffffff",
          color: effectiveDark ? "#f4f4f5" : "#1A1A19",
        }}
        className="min-h-screen flex flex-col transition-colors duration-200"
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <MarketingHeader />
        <main className="flex-1 pt-24 pb-20">{children}</main>
        <MarketingFooter />
      </div>
    </DocsDarkContext.Provider>
  );
}