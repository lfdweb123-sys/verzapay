"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ShieldCheck, ExternalLink, Loader2, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import type { Company } from "@/types";
import Link from "next/link";

function KycContent() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId");
  const { user } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    
    const unsub = onSnapshot(doc(db, "companies", companyId), (snap) => {
      if (snap.exists()) {
        setCompany({ id: snap.id, ...snap.data() } as Company);
      }
      setLoading(false);
    }, (error) => {
      console.error("Erreur lors du chargement de l'entreprise:", error);
      setLoading(false);
    });
    
    return unsub;
  }, [companyId]);

  async function startKyc() {
    if (!company || !user) return;
    setCreating(true);
    try {
      const res = await fetch("/api/verifypro/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          companyId: company.id, 
          uid: user.uid, 
          email: user.email, 
          displayName: user.displayName 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      setKycUrl(data.verificationUrl);
      show("Session KYC créée — vous pouvez commencer la vérification", "success");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-brand-600" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-12">
        <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center mx-auto">
          <XCircle size={32} className="text-danger-700" />
        </div>
        <p className="text-lg font-medium text-ink-900">Entreprise non trouvée</p>
        <p className="text-sm text-ink-500">L'entreprise que vous recherchez n'existe pas ou vous n'y avez pas accès.</p>
        <Link href="/dashboard" className="btn-secondary mx-auto">Retour au tableau de bord</Link>
      </div>
    );
  }

  // ✅ KYC APPROUVÉ
  if (company.kycStatus === "approved") {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-12">
        <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} className="text-success-700" />
        </div>
        <p className="text-lg font-medium text-ink-900">KYC approuvé ! 🎉</p>
        <p className="text-sm text-ink-500">
          Votre entreprise <strong>{company.name}</strong> est vérifiée. 
          Vous pouvez maintenant encaisser et décaisser des paiements.
        </p>
        {!company.legalInfo?.ifuNumber && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3.5 text-sm text-brand-800 text-left">
            Pensez à compléter les informations légales de votre entreprise (IFU, RCCM…) dans{" "}
            <Link href="/settings" className="font-medium underline">Paramètres → Entreprise</Link>.
          </div>
        )}
        <Link href="/dashboard" className="btn-primary mx-auto">Aller au tableau de bord</Link>
      </div>
    );
  }

  // ✅ KYC EN ATTENTE (pending)
  if (company.kycStatus === "pending") {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-12">
        <div className="w-16 h-16 rounded-full bg-warning-50 flex items-center justify-center mx-auto">
          <Clock size={32} className="text-warning-700" />
        </div>
        <p className="text-lg font-medium text-ink-900">Vérification en cours</p>
        <p className="text-sm text-ink-500">
          Votre dossier est en cours d'analyse automatique. Vous serez notifié par email et notification push dès qu'une décision est prise.
        </p>
        <div className="bg-brand-50 border border-brand-200 rounded-lg p-3.5 text-sm text-brand-800 text-left">
          En attendant, complétez les informations légales de votre entreprise (numéro IFU, RCCM, adresse…) dans{" "}
          <Link href="/settings" className="font-medium underline">Paramètres → Entreprise</Link> — cela accélère l&apos;examen de votre dossier.
        </div>
        <Link href="/dashboard" className="btn-secondary mx-auto">Retour au tableau de bord</Link>
      </div>
    );
  }

  // ✅ KYC EN RÉVISION MANUELLE (review) - NOUVEAU
  if (company.kycStatus === "review") {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-12">
        <div className="w-16 h-16 rounded-full bg-warning-50 flex items-center justify-center mx-auto">
          <AlertCircle size={32} className="text-warning-700" />
        </div>
        <p className="text-lg font-medium text-ink-900">Révision manuelle en cours</p>
        <p className="text-sm text-ink-500">
          Votre dossier est en cours de révision par notre équipe. 
          Vous serez notifié par email et notification push sous 24h.
        </p>
        <div className="bg-brand-50 border border-brand-200 rounded-lg p-3.5 text-sm text-brand-800 text-left">
          <p className="font-medium mb-1">📋 Pour accélérer le processus :</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Complétez les informations légales (IFU, RCCM, adresse)</li>
            <li>Vérifiez que vos documents sont lisibles</li>
            <li>Assurez-vous que votre photo est récente</li>
          </ul>
          <Link href="/settings" className="font-medium underline mt-2 block">
            Modifier les informations → 
          </Link>
        </div>
        <Link href="/dashboard" className="btn-secondary mx-auto">Retour au tableau de bord</Link>
      </div>
    );
  }

  // ✅ KYC REJETÉ
  if (company.kycStatus === "rejected") {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-12">
        <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center mx-auto">
          <XCircle size={32} className="text-danger-700" />
        </div>
        <p className="text-lg font-medium text-ink-900">Vérification rejetée</p>
        <p className="text-sm text-ink-500">
          Votre dossier a été rejeté. Veuillez recommencer la vérification avec des documents valides et lisibles.
        </p>
        <div className="bg-danger-50 border border-danger-200 rounded-lg p-3.5 text-sm text-danger-800 text-left">
          <p className="font-medium">⚠️ Causes possibles :</p>
          <ul className="list-disc list-inside mt-1">
            <li>Document illisible ou endommagé</li>
            <li>Photo non conforme</li>
            <li>Informations manquantes</li>
          </ul>
        </div>
        <button onClick={startKyc} disabled={creating} className="btn-primary mx-auto">
          {creating && <Loader2 size={15} className="animate-spin" />}
          {creating ? "Préparation..." : "Recommencer la vérification"}
        </button>
      </div>
    );
  }

  // ✅ KYC NON COMMENCÉ ou AWAITING_SUBMISSION
  const isResuming = company.kycStatus === "awaiting_submission" || company.kycStatus === "not_started";

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">
          {isResuming ? "Reprendre la vérification" : "Vérification d'identité"}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          {isResuming
            ? <>Vous avez démarré la vérification mais n&apos;avez pas encore soumis vos documents pour <strong>{company.name}</strong>.</>
            : <>Requis pour activer les paiements sur <strong>{company.name}</strong></>}
        </p>
      </div>

      <div className="card-base p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <ShieldCheck size={20} className="text-brand-700" />
          </div>
          <div>
            <p className="font-medium text-ink-900">Vérification KYC (Full)</p>
            <p className="text-sm text-ink-500">Alimenté par VerifyPro Africa</p>
          </div>
        </div>

        <div className="space-y-2.5 text-sm">
          {[
            "Document d'identité (CNI, passeport…)",
            "Selfie pour comparaison biométrique",
            "Vérification email et téléphone",
            "Contrôle AML / listes de sanctions",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-ink-700">
              <CheckCircle2 size={15} className="text-brand-600 shrink-0" />
              {item}
            </div>
          ))}
        </div>

        <p className="text-xs text-ink-500 bg-ink-50 rounded-lg p-3">
          Vos documents sont traités en mémoire et ne sont jamais stockés sur nos serveurs. 
          La vérification prend moins de 3 minutes.
        </p>

        {kycUrl ? (
          <a 
            href={kycUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn-primary w-full"
          >
            <ExternalLink size={15} /> Continuer la vérification KYC
          </a>
        ) : (
          <button 
            onClick={startKyc} 
            disabled={creating} 
            className="btn-primary w-full"
          >
            {creating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ShieldCheck size={15} />
            )}
            {creating ? "Préparation…" : "Commencer la vérification"}
          </button>
        )}

        {kycUrl && (
          <p className="text-xs text-center text-ink-500">
            Le lien s'ouvre dans un nouvel onglet. Revenez ici après avoir terminé.
          </p>
        )}
      </div>
    </div>
  );
}

export default function KycPendingPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-600" /></div>}>
      <KycContent />
    </Suspense>
  );
}