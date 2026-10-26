"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Traduction automatique FR → EN (DeepL côté serveur, mémorisée). Le français reste la langue d'origine :
// repasser en français recharge simplement la page. Les zones marquées translate="no" ou .notranslate
// sont ignorées ; l'espace admin n'est pas traduit.
const LANG_KEY = "vpz:lang";
const CACHE_KEY = "vpz:i18n:v1";
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT", "SVG", "INPUT", "SELECT"]);
const ATTRS = ["placeholder", "title", "aria-label"] as const;

export function getLang(): "fr" | "en" {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export function setLang(lang: "fr" | "en") {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignoré */ }
  if (lang === "fr") window.location.reload();
  else window.dispatchEvent(new Event("vpz:lang"));
}

function translatable(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 400) return false;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(t)) return false;
  if (/^https?:|@|^[\d\s.,:%€$+\-/()•·…]+$/.test(t)) return false;
  return true;
}

function skipElement(el: Element | null): boolean {
  for (let cur = el; cur; cur = cur.parentElement) {
    if (SKIP_TAGS.has(cur.tagName.toUpperCase())) return true;
    if (cur.getAttribute("translate") === "no" || cur.classList.contains("notranslate") || cur.getAttribute("contenteditable") === "true") return true;
  }
  return false;
}

export function AutoTranslate() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith("/admin")) return;

    let cache: Record<string, string> = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { cache = {}; }
    const applied = new WeakMap<Node, string>(); // nœud -> valeur que NOUS y avons écrite
    const attrApplied = new WeakMap<Element, Record<string, string>>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let observer: MutationObserver | null = null;

    const saveCache = () => {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
    };

    function collect(): { nodes: { node: Text; text: string }[]; attrs: { el: Element; attr: string; text: string }[] } {
      const nodes: { node: Text; text: string }[] = [];
      const attrs: { el: Element; attr: string; text: string }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const node = n as Text;
        const value = node.nodeValue ?? "";
        if (applied.get(node) === value) continue; // déjà traduit par nous
        if (!translatable(value) || skipElement(node.parentElement)) continue;
        nodes.push({ node, text: value.trim() });
      }
      document.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
        if (skipElement(el)) return;
        for (const attr of ATTRS) {
          const v = el.getAttribute(attr);
          if (v && translatable(v) && attrApplied.get(el)?.[attr] !== v) attrs.push({ el, attr, text: v.trim() });
        }
      });
      return { nodes, attrs };
    }

    async function fetchMissing(texts: string[]) {
      for (let i = 0; i < texts.length; i += 40) {
        const batch = texts.slice(i, i + 40);
        try {
          const res = await fetch("/api/i18n/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: batch }),
          });
          if (!res.ok) return; // non configuré / quota : le français reste affiché
          const data: { translations: (string | null)[] } = await res.json();
          data.translations.forEach((tr, idx) => { if (tr) cache[batch[idx]] = tr; });
        } catch { return; }
      }
      saveCache();
    }

    async function run() {
      if (busy || getLang() !== "en") return;
      busy = true;
      try {
        document.documentElement.lang = "en";
        let { nodes, attrs } = collect();
        const missing = Array.from(new Set([...nodes.map((n) => n.text), ...attrs.map((a) => a.text)])).filter((t) => !(t in cache));
        if (missing.length) {
          await fetchMissing(missing);
          ({ nodes, attrs } = collect());
        }
        observer?.disconnect();
        for (const { node, text } of nodes) {
          const tr = cache[text];
          if (!tr) continue;
          const original = node.nodeValue ?? "";
          const lead = original.match(/^\s*/)?.[0] ?? "";
          const trail = original.match(/\s*$/)?.[0] ?? "";
          const next = `${lead}${tr}${trail}`;
          node.nodeValue = next;
          applied.set(node, next);
        }
        for (const { el, attr, text } of attrs) {
          const tr = cache[text];
          if (!tr) continue;
          el.setAttribute(attr, tr);
          attrApplied.set(el, { ...(attrApplied.get(el) ?? {}), [attr]: tr });
        }
      } finally {
        busy = false;
        observer?.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 250);
    };

    observer = new MutationObserver(schedule);
    window.addEventListener("vpz:lang", schedule);
    if (getLang() === "en") schedule();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });

    return () => {
      observer?.disconnect();
      window.removeEventListener("vpz:lang", schedule);
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
