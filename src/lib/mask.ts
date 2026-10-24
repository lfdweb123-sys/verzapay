/**
 * Masque le milieu d'une valeur sensible en gardant les deux extrémités visibles
 * (ex. IBAN "BJ66 •••• •••• 1234", téléphone "+229••••••87").
 */
function maskKeep(value: string, keepStart: number, keepEnd: number): string {
  const s = value.replace(/\s+/g, "");
  if (s.length <= keepStart + keepEnd) return "•".repeat(Math.max(s.length, 4));
  return `${s.slice(0, keepStart)}${"•".repeat(Math.min(s.length - keepStart - keepEnd, 8))}${s.slice(-keepEnd)}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return maskKeep(phone, 4, 2);
}

export function maskAccount(value: string | null | undefined): string {
  if (!value) return "";
  const s = value.replace(/\s+/g, "");
  return s.length >= 12 ? maskKeep(s, 4, 4) : maskKeep(s, 2, 2);
}
