import crypto from "crypto";
import { maskPhone, maskAccount } from "@/lib/mask";

// Bénéficiaires de décaissement enregistrés pour pouvoir les réutiliser.
// Stockés côté serveur uniquement (sous-collection sans règle client = illisible depuis le
// navigateur). Le client ne reçoit que des valeurs masquées (extrémités visibles) ; pour
// réutiliser un bénéficiaire, il envoie son identifiant et le serveur reprend les vraies valeurs.

export interface StoredBeneficiary {
  type: "mobile_money" | "bank_transfer";
  name: string;
  phone: string;
  operator?: string | null; // réseau saisi par l'utilisateur (ex. "Moov BJ", "MTN BJ")
  bank?: {
    bankName: string;
    accountHolderName: string;
    iban?: string | null;
    bicSwift?: string | null;
    accountNumber?: string | null;
  } | null;
  updatedAt: number;
}

export function beneficiaryKey(b: Pick<StoredBeneficiary, "type" | "phone" | "operator" | "bank">): string {
  const material = [
    b.type,
    b.phone.replace(/\D/g, ""),
    (b.operator ?? "").toLowerCase().replace(/\s+/g, ""),
    (b.bank?.iban ?? b.bank?.accountNumber ?? "").replace(/\s+/g, "").toUpperCase(),
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 24);
}

/** Version destinée au navigateur : aucune donnée sensible en clair. */
export function toMaskedBeneficiary(id: string, b: StoredBeneficiary) {
  return {
    id,
    type: b.type,
    name: b.name,
    phoneMasked: maskPhone(b.phone),
    operator: b.operator ?? null,
    bankName: b.bank?.bankName ?? null,
    holder: b.bank?.accountHolderName ?? null,
    accountMasked: maskAccount(b.bank?.iban ?? b.bank?.accountNumber ?? ""),
  };
}
