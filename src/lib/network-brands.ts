// Identité visuelle des réseaux Mobile Money (pastilles rondes aux couleurs de chaque réseau).
// Les couleurs viennent des chartes publiques des opérateurs (valeurs approchées pour certains).
// Aucun logo officiel n'est embarqué (marques déposées) : pour en utiliser un, ajoutez son fichier dans
// public/networks/ puis déclarez-le dans OFFICIAL_LOGOS ci-dessous (aucune requête inutile n'est émise sinon).

export interface NetworkBrand {
  id: string;
  label: string;
  bg: string;    // couleur de fond de la pastille
  fg: string;    // couleur du texte
  ring?: string; // anneau secondaire (réseaux bicolores)
  mark: string;  // texte affiché dans la pastille
}

/** id de réseau -> chemin d'un logo officiel (vide par défaut). Ex : { mtn: "/networks/mtn.svg" } */
export const OFFICIAL_LOGOS: Record<string, string> = {};

const BRANDS: (NetworkBrand & { match: RegExp })[] = [
  { id: "mtn", match: /mtn|momo/i, label: "MTN MoMo", bg: "#FFCC00", fg: "#111111", mark: "MTN" },
  { id: "moov", match: /moov/i, label: "Moov Africa", bg: "#0B66B2", fg: "#FFFFFF", ring: "#F58220", mark: "moov" },
  { id: "orange", match: /orange/i, label: "Orange Money", bg: "#FF7900", fg: "#FFFFFF", mark: "orange" },
  { id: "wave", match: /wave/i, label: "Wave", bg: "#1DC8FF", fg: "#FFFFFF", mark: "wave" },
  { id: "airteltigo", match: /airtel.?tigo/i, label: "AirtelTigo", bg: "#E30613", fg: "#FFFFFF", ring: "#0B3C8C", mark: "A·T" },
  { id: "airtel", match: /airtel/i, label: "Airtel Money", bg: "#ED1C24", fg: "#FFFFFF", mark: "airtel" },
  { id: "tigo", match: /tigo/i, label: "Tigo", bg: "#00377B", fg: "#FFFFFF", mark: "tigo" },
  { id: "mpesa", match: /m-?pesa|mpesa/i, label: "M-Pesa", bg: "#43B02A", fg: "#FFFFFF", mark: "M-PESA" },
  { id: "vodacom", match: /vodacom/i, label: "Vodacom", bg: "#E60000", fg: "#FFFFFF", mark: "voda" },
  { id: "vodafone", match: /vodafone|telecel/i, label: "Vodafone Cash", bg: "#E60000", fg: "#FFFFFF", mark: "voda" },
  { id: "free", match: /free/i, label: "Free Money", bg: "#CD1E25", fg: "#FFFFFF", mark: "free" },
  { id: "expresso", match: /expresso/i, label: "Expresso", bg: "#6D2077", fg: "#FFFFFF", mark: "expr." },
  { id: "africell", match: /africell/i, label: "Africell", bg: "#8B1E8F", fg: "#FFFFFF", mark: "africell" },
  { id: "halopesa", match: /halo/i, label: "HaloPesa", bg: "#F26522", fg: "#FFFFFF", mark: "halo" },
  { id: "telebirr", match: /telebirr/i, label: "Telebirr", bg: "#0072BC", fg: "#FFFFFF", mark: "tele" },
  { id: "zamtel", match: /zamtel/i, label: "Zamtel", bg: "#009F4D", fg: "#FFFFFF", mark: "zamtel" },
];

function hashColor(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 42%)`;
}

/** Marque d'un réseau d'après le code / nom renvoyé par la passerelle. Inconnu : pastille neutre avec initiales. */
export function getNetworkBrand(code: string, name: string): NetworkBrand {
  const hit = BRANDS.find((b) => b.match.test(`${code} ${name}`));
  if (hit) return hit;
  const clean = name.replace(/\b(money|mobile|africa|bj|ci|sn|tg|bf|ml|ne|cm|cd|ga|gh)\b/gi, "").trim() || name;
  return { id: `other-${code}`, label: name, bg: hashColor(code), fg: "#FFFFFF", mark: clean.slice(0, 5) };
}
