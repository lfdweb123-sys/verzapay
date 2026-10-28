"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, X, Send, Loader2 } from "lucide-react";

interface Msg { role: "user" | "assistant"; content: string }

const HIDDEN_PREFIXES = ["/admin", "/pay", "/login", "/register", "/verify-2fa", "/unauthorized"];
const WELCOME = "Bonjour ! Je suis l'assistant Verzapay. Posez-moi une question sur les paiements, les retraits, la vérification d'identité ou l'API.";

export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, open]);

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname?.startsWith(p + "/"))) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-8) }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: res.ok ? data.reply : data.error ?? "L'assistant est indisponible." }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Connexion impossible. Réessayez ou contactez-nous sur WhatsApp." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {open && (
        <div className="fixed z-[55] bottom-36 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-96 max-h-[70dvh] flex flex-col rounded-2xl border border-ink-200 bg-white shadow-popover overflow-hidden">
          <div className="flex items-center justify-between bg-brand-700 text-white px-4 py-3">
            <div className="flex items-center gap-2"><Bot size={18} /><p className="text-sm font-medium">Assistant Verzapay</p></div>
            <button onClick={() => setOpen(false)} aria-label="Fermer" className="hover:opacity-80"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
            <div className="bg-ink-50 rounded-xl px-3.5 py-2.5 text-sm text-ink-800">{WELCOME}</div>
            {messages.map((m, i) => (
              <div key={i} translate="no" className={`notranslate max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${m.role === "user" ? "ml-auto bg-brand-50 text-ink-900" : "bg-ink-50 text-ink-800"}`}>{m.content}</div>
            ))}
            {busy && <div className="bg-ink-50 rounded-xl px-3.5 py-2.5 w-fit"><Loader2 size={16} className="animate-spin text-ink-400" /></div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="border-t border-ink-100 p-3 space-y-2">
            <div className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Votre question…" className="input-base" />
              <button type="submit" disabled={busy || !input.trim()} className="btn-primary px-3" aria-label="Envoyer"><Send size={15} /></button>
            </div>
            <p className="text-[10px] text-ink-400 leading-snug">Ne partagez jamais de mot de passe, de clé API, de code de vérification ni de numéro de carte. Réponses générées par IA : en cas de doute, contactez-nous sur WhatsApp.</p>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Ouvrir l'assistant"
        className="fixed z-[55] bottom-20 right-4 sm:right-6 w-14 h-14 rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 transition flex items-center justify-center"
      >
        {open ? <X size={22} /> : <Bot size={24} />}
      </button>
    </div>
  );
}
