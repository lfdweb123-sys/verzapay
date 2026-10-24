// Identifiants de navigation conservés hors de l'URL : aucune adresse du site ne
// contient d'identifiant (entreprise, produit...). L'id est mémorisé au clic sur
// le lien et relu par la page de destination.
const PREFIX = "vpz:nav:";

export function setNavId(kind: string, id: string): void {
  try {
    localStorage.setItem(PREFIX + kind, id);
  } catch { /* stockage indisponible */ }
}

export function getNavId(kind: string): string | null {
  try {
    return localStorage.getItem(PREFIX + kind);
  } catch {
    return null;
  }
}
