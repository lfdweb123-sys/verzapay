// Traductions locales (sans DeepL ni quota) des dates et jours français ; détection des textes qui ne
// doivent pas partir au traducteur (références, numéros...).

const MONTHS: [RegExp, string][] = [
  [/\bjanvier\b/gi, "January"], [/\bfévrier\b/gi, "February"], [/\bmars\b/gi, "March"], [/\bavril\b/gi, "April"],
  [/\bmai\b/gi, "May"], [/\bjuin\b/gi, "June"], [/\bjuillet\b/gi, "July"], [/\baoût\b/gi, "August"],
  [/\bseptembre\b/gi, "September"], [/\boctobre\b/gi, "October"], [/\bnovembre\b/gi, "November"], [/\bdécembre\b/gi, "December"],
  [/\bjanv\.?(?=\W|$)/gi, "Jan."], [/\bfévr\.?(?=\W|$)/gi, "Feb."], [/\bavr\.?(?=\W|$)/gi, "Apr."], [/\bjuil\.?(?=\W|$)/gi, "Jul."],
  [/\bsept\.?(?=\W|$)/gi, "Sep."], [/\boct\.?(?=\W|$)/gi, "Oct."], [/\bnov\.?(?=\W|$)/gi, "Nov."], [/\bdéc\.?(?=\W|$)/gi, "Dec."],
];
const DAYS: [RegExp, string][] = [
  [/\blundi\b/gi, "Monday"], [/\bmardi\b/gi, "Tuesday"], [/\bmercredi\b/gi, "Wednesday"], [/\bjeudi\b/gi, "Thursday"],
  [/\bvendredi\b/gi, "Friday"], [/\bsamedi\b/gi, "Saturday"], [/\bdimanche\b/gi, "Sunday"],
  [/\blun\.(?=\W|$)/gi, "Mon."], [/\bmar\.(?=\W|$)/gi, "Tue."], [/\bmer\.(?=\W|$)/gi, "Wed."], [/\bjeu\.(?=\W|$)/gi, "Thu."],
  [/\bven\.(?=\W|$)/gi, "Fri."], [/\bsam\.(?=\W|$)/gi, "Sat."], [/\bdim\.(?=\W|$)/gi, "Sun."],
];

/**
 * Si le texte n'est qu'une date / heure / montant (mots = mois ou jours uniquement), renvoie sa version
 * anglaise calculée localement ; sinon null (le texte part au traducteur).
 */
export function translateDateLike(text: string): string | null {
  let out = text;
  let touched = false;
  for (const [re, rep] of [...MONTHS, ...DAYS]) {
    const next = out.replace(re, rep);
    if (next !== out) { touched = true; out = next; }
  }
  if (!touched) return null;
  // Il ne doit rester aucun autre mot (3 lettres ou plus) hors mois/jours déjà traduits
  const leftovers = out.replace(/January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Apr\.?|Jul\.?|Sep\.?|Oct\.?|Nov\.?|Dec\.?|Mon(?:day)?\.?|Tue(?:sday)?\.?|Wed(?:nesday)?\.?|Thu(?:rsday)?\.?|Fri(?:day)?\.?|Sat(?:urday)?\.?|Sun(?:day)?\.?|à|at|h/gi, "");
  return /[A-Za-zÀ-ÿ]{3,}/.test(leftovers) ? null : out.replace(/(^|\s)à(?=\s|$)/g, "$1at");
}

/** Références, identifiants, numéros : jamais envoyés au traducteur (évite de gaspiller le quota). */
export function isDynamicToken(text: string): boolean {
  const t = text.trim();
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) return true;                       // email
  if (/^(?:https?:\/\/|www\.)/i.test(t)) return true;                         // url
  const letters = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits >= 6 && digits >= letters) return true;                          // numéros, montants longs
  if (/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{6,}\b/.test(t) && t.split(/\s+/).length <= 3) return true; // références type VPZ-1A2B3C4D
  return false;
}
