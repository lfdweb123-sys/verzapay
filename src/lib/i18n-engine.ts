import { translateDateLike, isDynamicToken } from "./i18n-local";

// Moteur de traduction automatique FR → EN de TOUT le site (pages publiques, tableau de bord, admin, page de paiement) :
// textes, listes déroulantes (options), placeholders, infobulles, libellés d'accessibilité, boutons, images
// (alt) et titre de l'onglet. DeepL côté serveur, résultats mémorisés (une phrase n'est traduite qu'une fois).
// Seules les zones marquées translate="no" / .notranslate (code, sélecteur de langue) sont ignorées.
const LANG_KEY = "vpz:lang";
const CACHE_KEY = "vpz:i18n:v2";
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT", "SVG", "INPUT"]);
const TEXT_ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const ATTR_SELECTOR = "[placeholder],[title],[aria-label],[alt],input[type=submit],input[type=button],input[type=reset]";
const OBSERVE: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TEXT_ATTRS, "value"] };

export function getLang(): "fr" | "en" {
  try { return localStorage.getItem(LANG_KEY) === "en" ? "en" : "fr"; } catch { return "fr"; }
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
  if (/^[\d\s.,:%€$+\-/()•·…]+$/.test(t)) return false;
  return true;
}

function skipElement(el: Element | null, forAttribute = false): boolean {
  for (let cur = el; cur; cur = cur.parentElement) {
    const tag = cur.tagName.toUpperCase();
    // Pour un attribut (placeholder, value...), INPUT / TEXTAREA sont justement les éléments à traduire
    if (SKIP_TAGS.has(tag) && !(forAttribute && cur === el && (tag === "INPUT" || tag === "TEXTAREA"))) return true;
    if (cur.getAttribute("translate") === "no" || cur.classList.contains("notranslate") || cur.getAttribute("contenteditable") === "true") return true;
  }
  return false;
}

/** Démarre la traduction automatique du document courant ; renvoie la fonction d'arrêt. */
export function startAutoTranslate(): () => void {
  let cache: Record<string, string> = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { cache = {}; }
  const appliedText = new WeakMap<Node, string>();
  const appliedAttr = new WeakMap<Element, Record<string, string>>();
  let appliedTitle = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let again = false;
  let observer: MutationObserver | null = null;

  const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ } };
  const local = (text: string): string | null => {
    if (text in cache) return cache[text];
    const d = translateDateLike(text);
    if (d !== null) { cache[text] = d; return d; }
    return null;
  };
  const needsServer = (text: string) => translatable(text) && !isDynamicToken(text);

  interface Found {
    nodes: { node: Text; text: string }[];
    attrs: { el: Element; attr: string; text: string }[];
    title: string | null;
  }

  function collect(): Found {
    const nodes: Found["nodes"] = [];
    const attrs: Found["attrs"] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const node = n as Text;
      const value = node.nodeValue ?? "";
      if (appliedText.get(node) === value) continue;
      if (!translatable(value) || skipElement(node.parentElement)) continue;
      nodes.push({ node, text: value.trim() });
    }
    document.querySelectorAll(ATTR_SELECTOR).forEach((el) => {
      if (skipElement(el, true)) return;
      const isButtonInput = el.tagName === "INPUT" && ["submit", "button", "reset"].includes((el as HTMLInputElement).type);
      const names: string[] = [...TEXT_ATTRS, ...(isButtonInput ? ["value"] : [])];
      for (const attr of names) {
        const v = el.getAttribute(attr);
        if (v && translatable(v) && appliedAttr.get(el)?.[attr] !== v) attrs.push({ el, attr, text: v.trim() });
      }
    });
    const title = document.title && translatable(document.title) && document.title !== appliedTitle ? document.title.trim() : null;
    return { nodes, attrs, title };
  }

  async function fetchMissing(texts: string[]) {
    for (let i = 0; i < texts.length; i += 40) {
      const batch = texts.slice(i, i + 40);
      try {
        const res = await fetch("/api/i18n/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: batch }) });
        if (!res.ok) return; // non configuré / quota atteint : le français reste affiché
        const data: { translations: (string | null)[] } = await res.json();
        data.translations.forEach((tr, idx) => { if (tr) cache[batch[idx]] = tr; });
      } catch { return; }
    }
    saveCache();
  }

  async function run() {
    if (getLang() !== "en") return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      document.documentElement.lang = "en";
      let found = collect();
      const all = [...found.nodes.map((n) => n.text), ...found.attrs.map((a) => a.text), ...(found.title ? [found.title] : [])];
      const missing = Array.from(new Set(all)).filter((t) => local(t) === null && needsServer(t));
      if (missing.length) { await fetchMissing(missing); found = collect(); }

      observer?.disconnect();
      for (const { node, text } of found.nodes) {
        const tr = local(text);
        if (!tr) continue;
        const original = node.nodeValue ?? "";
        const next = `${original.match(/^\s*/)?.[0] ?? ""}${tr}${original.match(/\s*$/)?.[0] ?? ""}`;
        node.nodeValue = next;
        appliedText.set(node, next);
      }
      for (const { el, attr, text } of found.attrs) {
        const tr = local(text);
        if (!tr) continue;
        if (attr === "value") (el as HTMLInputElement).value = tr; else el.setAttribute(attr, tr);
        appliedAttr.set(el, { ...(appliedAttr.get(el) ?? {}), [attr]: tr });
      }
      if (found.title) {
        const tr = local(found.title);
        if (tr) { document.title = tr; appliedTitle = tr; }
      }
      saveCache();
    } finally {
      busy = false;
      observer?.observe(document.body, OBSERVE);
      observer?.observe(document.head, { childList: true, subtree: true, characterData: true });
      if (again) { again = false; schedule(); }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 200);
  }

  observer = new MutationObserver(schedule);
  window.addEventListener("vpz:lang", schedule);
  if (getLang() === "en") schedule();
  observer.observe(document.body, OBSERVE);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });


  return () => {
    observer?.disconnect();
    window.removeEventListener("vpz:lang", schedule);
    if (timer) clearTimeout(timer);
  };
}
