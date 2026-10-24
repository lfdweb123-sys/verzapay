"use client";

import { useState } from "react";
import { ShieldAlert, X, ArrowRight, Loader2, FileWarning } from "lucide-react";
import Link from "next/link";
import type { Company } from "@/types";
import { cn } from "@/lib/utils";

export function KycBanner({ company }: { company: Company }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const status = company.kycStatus;
  const isAwaiting = status === "awaiting_submission";
  const isAnalyzing = status === "pending" || status === "review";
  const isRejected = status === "rejected";
  const isNotStarted = status === "not_started";

  // Aucune bannière à afficher si déjà approuvé (géré par l'appelant normalement)
  if (status === "approved") return null;

  const config = isAwaiting
    ? { icon: FileWarning, bg: "bg-warning-50 border-warning-500/30", text: "text-warning-900", sub: "text-warning-700",
        title: "Documents à soumettre", body: "Vous avez démarré la vérification mais n'avez pas encore soumis vos documents. Reprenez la procédure pour activer les paiements." }
    : isAnalyzing
    ? { icon: Loader2, bg: "bg-warning-50 border-warning-500/30", text: "text-warning-900", sub: "text-warning-700",
        title: "Vérification KYC en cours", body: "Vos documents sont en cours d'examen. Vous serez notifié dès qu'une décision sera prise." }
    : isRejected
    ? { icon: ShieldAlert, bg: "bg-danger-50 border-danger-500/30", text: "text-danger-900", sub: "text-danger-700",
        title: "Vérification KYC rejetée", body: "Votre dossier a été rejeté. Veuillez recommencer la vérification." }
    : { icon: ShieldAlert, bg: "bg-brand-50 border-brand-500/30", text: "text-brand-900", sub: "text-brand-700",
        title: "Vérification d'identité requise", body: "Complétez la vérification KYC pour activer les paiements sur cette entreprise." };

  const Icon = config.icon;
  const showAction = isNotStarted || isRejected || isAwaiting;

  return (
    <div className={cn("relative flex items-start gap-3 rounded-xl border px-4 py-3.5", config.bg)}>
      <Icon size={18} className={cn(config.sub, "shrink-0 mt-0.5", isAnalyzing && "animate-spin")} />

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", config.text)}>{config.title}</p>
        <p className={cn("text-xs mt-0.5", config.sub)}>{config.body}</p>
      </div>

      {showAction && (
        <Link
          href="/kyc-pending"
          className={cn(
            "shrink-0 inline-flex items-center gap-1 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap",
            isRejected ? "bg-danger-500 text-white hover:bg-danger-700" : "bg-brand-700 text-white hover:bg-brand-800"
          )}
        >
          {isAwaiting ? "Reprendre" : "Commencer"} <ArrowRight size={12} />
        </Link>
      )}

      <button onClick={() => setDismissed(true)} className="shrink-0 text-ink-400 hover:text-ink-700" aria-label="Fermer">
        <X size={16} />
      </button>
    </div>
  );
}
