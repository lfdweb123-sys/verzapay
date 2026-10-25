// Protège les noms de marque / unités pendant la traduction (DeepL tag_handling "xml" + ignore_tags "x").
const PROTECTED = ["Verzapay", "Mobile Money", "WhatsApp", "FCFA", "XOF", "XAF", "KYC", "AML", "API", "Visa", "Mastercard", "MTN", "Moov", "Orange", "Wave", "IBAN", "BIC", "SWIFT", "OTP", "WooCommerce", "Shopify"];

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function protectText(text: string): string {
  let out = escapeXml(text);
  for (const term of PROTECTED) {
    out = out.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), `<x>${term}</x>`);
  }
  return out;
}

export function unprotectText(text: string): string {
  return unescapeXml(text.replace(/<\/?x>/g, ""));
}
