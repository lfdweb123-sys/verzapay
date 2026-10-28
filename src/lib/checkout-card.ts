// ─────────────────────────────────────────────────────────────────────────────
// PAIEMENT PAR CARTE — point d'extension unique
//
// Aujourd'hui, JoonaPay ne renvoie pas l'URL Stripe Checkout : le client est redirigé vers le lien de
// paiement du partenaire (payment_link) conservé dans la session. Dès que JoonaPay fournira l'URL
// Stripe de chaque paiement par carte, c'est CETTE fonction (et elle seule) qu'il faudra adapter :
// récupérer l'URL Stripe, la renvoyer ici, et la page hébergée y redirigera directement.
// ─────────────────────────────────────────────────────────────────────────────
export interface CardSessionLike {
  paymentLink?: string;
  joonapayUuid?: string;
}

export async function getCardRedirectUrl(session: CardSessionLike): Promise<string | null> {
  const link = session.paymentLink;
  return link && link.startsWith("https://") ? link : null;
}
