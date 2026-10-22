// Détection de messages de spam du type "JdGfuYjkbbpofRHvSmBrXjk" :
// un seul "mot" aléatoire, sans espace, avec des majuscules/minuscules mélangées.
// Utilisé côté client (bouton désactivé) ET côté serveur (rejet silencieux).

function isGibberishToken(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (s.length < 10) return false;
  if (/\s/.test(s)) return false;
  if (!/^[A-Za-z]+$/.test(s)) return false;
  let switches = 0;
  for (let i = 1; i < s.length; i++) {
    if (/[a-z]/.test(s[i - 1]) && /[A-Z]/.test(s[i])) switches++;
  }
  return switches >= 3;
}

export function isSpamContact(fields: { name?: string | null; subject?: string | null; message?: string | null }): boolean {
  return isGibberishToken(fields.name) || isGibberishToken(fields.subject) || isGibberishToken(fields.message);
}
