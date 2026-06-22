"use client";

import { useState } from "react";
import { Loader2, Send, MessageCircle, Mail, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";

const WHATSAPP_NUMBER = "22962758703"; // basé sur le numéro de contact déclaré de l'entreprise
const CONTACT_EMAIL = "contact@verzapay.com";

export function ContactForm({ source }: { source: "contact" | "support" }) {
  const { user, appUser } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();

  const [name, setName] = useState(appUser?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, subject, message, source,
          uid: user?.uid ?? null,
          companyId: activeCompany?.id ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi");
      setSent(true);
      show("Message envoyé avec succès", "success");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  const whatsappMessage = encodeURIComponent(
    source === "support" ? "Bonjour, j'ai besoin d'aide concernant mon compte Verzapay." : "Bonjour, je souhaite avoir des informations sur Verzapay."
  );

  if (sent) {
    return (
      <div className="card-base p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto">
          <CheckCircle2 size={24} className="text-success-700" />
        </div>
        <p className="font-medium text-ink-900">Message envoyé !</p>
        <p className="text-sm text-ink-500">Nous vous répondrons par email dans les plus brefs délais.</p>
        <button onClick={() => { setSent(false); setSubject(""); setMessage(""); }} className="btn-secondary mx-auto text-sm">
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-5">
      {/* Formulaire */}
      <div className="card-base p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Nom complet *</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom" className="input-base" />
            </div>
            <div>
              <label className="label-base">Email *</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" className="input-base" />
            </div>
          </div>
          <div>
            <label className="label-base">Sujet</label>
            <input
              type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder={source === "support" ? "Ex : Problème avec un paiement" : "Ex : Question sur les tarifs"}
              className="input-base"
            />
          </div>
          <div>
            <label className="label-base">Message *</label>
            <textarea
              required rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Décrivez votre demande en détail…"
              className="input-base h-auto py-2.5 resize-none"
            />
          </div>
          <button type="submit" disabled={sending} className="btn-primary">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Envoyer le message
          </button>
        </form>
      </div>

      {/* Canaux directs */}
      <div className="space-y-3">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          className="card-base p-4 flex items-center gap-3 hover:border-success-500/40 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center shrink-0">
            <MessageCircle size={18} className="text-success-700" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-900">WhatsApp</p>
            <p className="text-xs text-ink-500">Réponse rapide</p>
          </div>
        </a>

        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="card-base p-4 flex items-center gap-3 hover:border-brand-500/40 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <Mail size={18} className="text-brand-700" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-900">Email</p>
            <p className="text-xs text-ink-500">{CONTACT_EMAIL}</p>
          </div>
        </a>
      </div>
    </div>
  );
}
