"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, Loader2, Send, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const SEVERITIES = [
  { value: "low", label: "Faible", hint: "Gêne mineure" },
  { value: "medium", label: "Moyenne", hint: "Fonction perturbée" },
  { value: "critical", label: "Critique", hint: "Bloquant / argent concerné" },
] as const;

type Severity = (typeof SEVERITIES)[number]["value"];

export default function BugReportPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const pathname = usePathname();

  const [title, setTitle] = useState("");
  const [page, setPage] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSending(true);
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          companyId: activeCompany?.id ?? null,
          title, page: page || null, severity, description, steps: steps || null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi");
      setSent(true);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setSent(false); setTitle(""); setPage(""); setSeverity("medium"); setDescription(""); setSteps("");
  }

  if (sent) {
    return (
      <div className="max-w-lg mx-auto card-base p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto">
          <CheckCircle2 size={24} className="text-success-700" />
        </div>
        <p className="font-medium text-ink-900">Merci, bug signalé !</p>
        <p className="text-sm text-ink-500">Notre équipe a bien reçu votre signalement et va l&apos;examiner.</p>
        <button onClick={reset} className="btn-secondary mx-auto text-sm">Signaler un autre bug</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-lg font-medium text-ink-900"><Bug size={18} /> Signaler un bug</h1>
        <p className="text-sm text-ink-500 mt-1">Décrivez le problème rencontré pour que nous puissions le corriger rapidement.</p>
      </div>

      <form onSubmit={handleSubmit} className="card-base p-5 space-y-4">
        <div>
          <label className="label-base">Titre du problème *</label>
          <input type="text" required minLength={3} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Le lien de paiement ne s'affiche pas" className="input-base" />
        </div>
        <div>
          <label className="label-base">Page concernée</label>
          <input type="text" value={page} onChange={(e) => setPage(e.target.value)} placeholder={`Ex : ${pathname ?? "/payments"}`} className="input-base" />
        </div>
        <div>
          <label className="label-base">Gravité</label>
          <div className="grid grid-cols-3 gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s.value} type="button" onClick={() => setSeverity(s.value)}
                className={cn("rounded-xl border py-2.5 px-2 text-center transition-colors",
                  severity === s.value ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50")}
              >
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-[11px] text-ink-400">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label-base">Description *</label>
          <textarea required minLength={10} maxLength={4000} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Que s'est-il passé ? Que s'attendait-on à voir ?" className="input-base h-auto py-2.5 resize-none" />
        </div>
        <div>
          <label className="label-base">Étapes pour reproduire (optionnel)</label>
          <textarea rows={3} maxLength={3000} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"1. Aller sur…\n2. Cliquer sur…"} className="input-base h-auto py-2.5 resize-none" />
        </div>
        <button type="submit" disabled={sending} className="btn-primary">
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Envoyer le signalement
        </button>
      </form>
    </div>
  );
}
