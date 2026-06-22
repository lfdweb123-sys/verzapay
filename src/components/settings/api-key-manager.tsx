"use client";

import { useState } from "react";
import { Key, Copy, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import type { Company } from "@/types";

export function ApiKeyManager({ company }: { company: Company }) {
  const { user } = useAuth();
  const { show } = useToast();
  const [generating, setGenerating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [revealedPublic, setRevealedPublic] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState<"public" | "secret" | null>(null);

  const hasExistingKey = Boolean(company.apiKeySecretGenerated);

  async function handleGenerate() {
    if (!user) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/company/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la génération");
      setRevealedSecret(data.secretKey);
      setRevealedPublic(data.publicKey);
      setConfirmOpen(false);
      show("Clé générée — copiez-la maintenant, elle ne sera plus jamais affichée", "success");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setGenerating(false);
    }
  }

  function copy(value: string, which: "public" | "secret") {
    navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  // Clé révélée juste après génération — affichage one-time
  if (revealedSecret && revealedPublic) {
    return (
      <div className="card-base p-5 space-y-4 border-2 border-warning-500/40">
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={18} className="text-warning-700" />
          <p className="font-medium text-ink-900">Copiez votre clé secrète maintenant</p>
        </div>
        <p className="text-sm text-warning-700 bg-warning-50 rounded-lg p-3">
          Cette clé secrète ne sera plus jamais affichée. Si vous la perdez, vous devrez en générer une nouvelle.
        </p>

        <div>
          <label className="label-base">Clé publique</label>
          <div className="relative">
            <input readOnly value={revealedPublic} className="input-base pr-10 font-mono text-xs" />
            <button onClick={() => copy(revealedPublic, "public")} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded flex items-center justify-center hover:bg-ink-100 text-ink-500">
              {copied === "public" ? <CheckCircle2 size={14} className="text-success-600" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label className="label-base">Clé secrète</label>
          <div className="relative">
            <input readOnly value={revealedSecret} className="input-base pr-10 font-mono text-xs bg-warning-50 border-warning-300" />
            <button onClick={() => copy(revealedSecret, "secret")} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded flex items-center justify-center hover:bg-warning-100 text-warning-700">
              {copied === "secret" ? <CheckCircle2 size={14} className="text-success-600" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <button onClick={() => { setRevealedSecret(null); setRevealedPublic(null); }} className="btn-secondary text-sm">
          J&apos;ai copié ma clé, masquer
        </button>
      </div>
    );
  }

  return (
    <div className="card-base p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <Key size={18} className="text-brand-700" />
        <p className="font-medium text-ink-900">Clé API</p>
      </div>

      {hasExistingKey ? (
        <>
          <div className="bg-ink-50 rounded-lg p-4">
            <p className="text-sm text-ink-700">
              Clé active : <span className="font-mono">vpz_sk_••••••••••••{company.apiKeySecretLastFour}</span>
            </p>
            <p className="text-xs text-ink-500 mt-1">
              Clé publique : <span className="font-mono">{company.apiKeyPublic}</span>
            </p>
          </div>
          <p className="text-xs text-ink-500">
            Pour des raisons de sécurité, votre clé secrète complète ne peut plus être affichée. Vous pouvez générer une nouvelle clé, ce qui invalidera l&apos;ancienne.
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-500">
          Générez votre clé API pour intégrer Verzapay à votre application. La clé secrète ne sera affichée qu&apos;une seule fois après génération.
        </p>
      )}

      {!confirmOpen ? (
        <button onClick={() => setConfirmOpen(true)} className="btn-primary">
          <Key size={15} />
          {hasExistingKey ? "Générer une nouvelle clé" : "Générer ma clé API"}
        </button>
      ) : (
        <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-danger-900">
            {hasExistingKey
              ? "Générer une nouvelle clé invalidera immédiatement l'ancienne. Toute intégration utilisant l'ancienne clé cessera de fonctionner."
              : "Vous êtes sur le point de générer votre clé API."}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmOpen(false)} className="btn-secondary text-sm">Annuler</button>
            <button onClick={handleGenerate} disabled={generating} className="btn-danger text-sm">
              {generating && <Loader2 size={14} className="animate-spin" />}
              Confirmer la génération
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
