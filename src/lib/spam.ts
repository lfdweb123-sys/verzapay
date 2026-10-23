// Détection générale de spam du formulaire de contact.
// Utilisée côté client (bouton désactivé) ET côté serveur (rejet silencieux).

function caseSwitches(s: string): number {
  let n = 0;
  for (let i = 1; i < s.length; i++) {
    if (/[a-z]/.test(s[i - 1]) && /[A-Z]/.test(s[i])) n++;
  }
  return n;
}

// Suite de lettres aléatoire : un "mot" long sans espace, à casse mélangée,
// ou sans voyelles / avec de longues suites de consonnes.
function isGibberishToken(token: string): boolean {
  if (token.length < 8 || !/^[A-Za-z]+$/.test(token)) return false;
  if (caseSwitches(token) >= 3) return true;
  if (/[^aeiouyAEIOUY]{6,}/.test(token)) return true;
  const vowels = (token.match(/[aeiouyAEIOUY]/g) ?? []).length;
  return token.length >= 12 && vowels / token.length < 0.2;
}

export function isGibberish(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (!s) return false;
  const words = s.split(/\s+/);
  // Un texte court dont tous les "mots" longs sont aléatoires
  const long = words.filter((w) => w.length >= 8);
  if (long.length === 0) return false;
  const bad = long.filter(isGibberishToken).length;
  return bad > 0 && bad === long.length && words.length <= 6;
}

/**
 * Compte inscrit par un robot : nom affiché aléatoire (ex. "sKGvFBwKCFuVAkUiGlCkHmC"),
 * ou adresse Gmail "à points" avec un nom d'un seul mot.
 */
export function isSpamAccount(a: { displayName?: string | null; email?: string | null }): boolean {
  if (isGibberish(a.displayName)) return true;
  const name = (a.displayName ?? "").trim();
  return hasDottedLocalPart(a.email) && name !== "" && !/\s/.test(name);
}

function countLinks(s: string): number {
  return (s.match(/https?:\/\/|www\./gi) ?? []).length;
}

// Adresses Gmail "à points" typiques des bots : h.j.a.c.ob.s.28.m.n@gmail.com
export function hasDottedLocalPart(email: string | null | undefined): boolean {
  const local = (email ?? "").split("@")[0] ?? "";
  return (local.match(/\./g) ?? []).length >= 4;
}

export function isSpamContact(fields: {
  name?: string | null;
  subject?: string | null;
  message?: string | null;
  email?: string | null;
}): boolean {
  const { name, subject, message, email } = fields;
  if (isGibberish(name) || isGibberish(subject) || isGibberish(message)) return true;
  if (hasDottedLocalPart(email) && (isGibberish(subject) || isGibberish(message) || isGibberish(name))) return true;
  if (countLinks(`${subject ?? ""} ${message ?? ""}`) >= 2) return true;
  return false;
}
