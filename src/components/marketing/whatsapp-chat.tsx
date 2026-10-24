"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "22962758703";
const WHATSAPP_TEXT = encodeURIComponent("Bonjour, je souhaite avoir des informations sur Verzapay.");

// Le chat est visible chaque jour de 6h à 20h (heure du Bénin, UTC+1, sans changement d'heure),
// masqué de 20h à 6h.
const BENIN_UTC_OFFSET_HOURS = 1;
const SHOW_FROM_HOUR = 6;
const HIDE_FROM_HOUR = 20;

function isChatOpen(now: Date = new Date()): boolean {
  const hour = (now.getUTCHours() + BENIN_UTC_OFFSET_HOURS) % 24;
  return hour >= SHOW_FROM_HOUR && hour < HIDE_FROM_HOUR;
}

// Bouton de chat WhatsApp flottant, à gauche de l'écran (le bouton
// "remonter en haut" reste à droite).
export function WhatsAppChat() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(isChatOpen());
    // Réévalué chaque minute : disparaît à 20h, réapparaît à 6h sans recharger la page
    const timer = setInterval(() => setOpen(isChatOpen()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!open) return null;

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
