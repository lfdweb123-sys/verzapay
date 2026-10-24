// Tant que l'identité de l'entreprise active n'est pas validée (kycStatus !== "approved"),
// le tableau de bord est verrouillé : toutes les actions sont grisées, et l'accès direct
// (par l'URL) aux autres pages mène à la page "Vous n'êtes pas autorisé".

/** Pages accessibles en consultation (le contenu y est grisé et inactif). */
const VIEW_ONLY_PATHS = ["/dashboard", "/notifications"];
/** Pages restant totalement actives : nécessaires pour sortir du verrouillage ou demander de l'aide. */
const INTERACTIVE_PATHS = ["/kyc-pending", "/companies/new", "/support", "/bug-report"];

const matches = (path: string, base: string) => path === base || path.startsWith(base + "/");

export function isKycLocked(company: { kycStatus?: string } | null | undefined): boolean {
  return !!company && company.kycStatus !== "approved";
}

export function isInteractiveWhenLocked(path: string): boolean {
  return INTERACTIVE_PATHS.some((p) => matches(path, p));
}

export function isAllowedWhenLocked(path: string): boolean {
  return isInteractiveWhenLocked(path) || VIEW_ONLY_PATHS.some((p) => matches(path, p));
}
