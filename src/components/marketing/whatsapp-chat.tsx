"use client";

import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "22962758703";
const WHATSAPP_TEXT = encodeURIComponent("Bonjour, je souhaite avoir des informations sur Verzapay.");

// Bouton de chat WhatsApp flottant, à gauche de l'écran (le bouton
// "remonter en haut" reste à droite).
export function WhatsAppChat() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_TEXT}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Discuter sur WhatsApp"
      className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-lg hover:brightness-95 transition px-4 h-12"
    >
      <MessageCircle size={22} />
      <span className="hidden sm:inline text-sm font-medium">Discuter sur WhatsApp</span>
    </a>
  );
}
