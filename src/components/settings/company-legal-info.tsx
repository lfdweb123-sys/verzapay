"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Loader2, FileText, Upload, CheckCircle2, X, ShieldCheck, AlertTriangle, User } from "lucide-react";
import type { Company } from "@/types";

// Limite alignée sur lib/validation.ts (base64Pdf) : 500 000 caractères en
// base64 ≈ 370 Ko de PDF réel après décodage. On vérifie aussi côté client
// pour donner un message immédiat plutôt que d'attendre l'aller-retour serveur.
const MAX_PDF_BASE64_LENGTH = 500_000;

function formatKb(base64Length: number): number {
  // Un PDF encodé en base64 fait environ 4/3 de sa taille réelle.
  return Math.round((base64Length * 0.75) / 1024);
}

export function CompanyLegalInfo({ company }: { company: Company }) {
  const { user } = useAuth();
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [form, setForm] = useState({
    ifuNumber: company.legalInfo?.ifuNumber ?? "",
    rccmNumber: company.legalInfo?.rccmNumber ?? "",
    legalCategory: company.legalInfo?.legalCategory ?? "",
    taxRegime: company.legalInfo?.taxRegime ?? "",
    ownerFullName: company.legalInfo?.ownerFullName ?? "",
    address: company.legalInfo?.address ?? "",
    activityDescription: company.legalInfo?.activityDescription ?? "",
  });

  // null = pas de changement par rapport à l'existant ; "" = suppression
  // explicite demandée ; "data:application/pdf;base64,..." = nouveau fichier.
  const [pendingPdfBase64, setPendingPdfBase64] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  const hasExistingPdf = Boolean(company.legalInfo?.rccmDocumentBase64);
  // Une entreprise "particulier" est déduite par l'absence d'IFU/RCCM déjà
  // enregistrés — purement informatif ici, n'empêche jamais la saisie.
  const looksLikeIndividualSoFar = !company.legalInfo?.ifuNumber && !company.legalInfo?.rccmNumber;

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      show("Seuls les fichiers PDF sont acceptés", "error");
      e.target.value = "";
      return;
    }

    setUploadingPdf(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (result.length > MAX_PDF_BASE64_LENGTH) {
        show(
          `Le PDF est trop lourd (${formatKb(result.length)} Ko). Compressez-le à moins de ~370 Ko et réessayez.`,
          "error"
        );
        setUploadingPdf(false);
        e.target.value = "";
        return;
      }
      setPendingPdfBase64(result);
      setPdfFileName(file.name);
      setUploadingPdf(false);
    };
    reader.onerror = () => {
      show("Erreur lors de la lecture du fichier", "error");
      setUploadingPdf(false);
    };
    reader.readAsDataURL(file);
  }

  function removePendingOrExistingPdf() {
    // Si un nouveau fichier était en attente (pas encore sauvegardé), on
    // l'annule simplement. Sinon, on marque explicitement le document
    // existant pour suppression au prochain enregistrement.
    if (pendingPdfBase64) {
      setPendingPdfBase64(null);
      setPdfFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (hasExistingPdf) {
      setPendingPdfBase64("__DELETE__");
      setPdfFileName(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };

      if (pendingPdfBase64 === "__DELETE__") {
        payload.rccmDocumentBase64 = null;
      } else if (pendingPdfBase64) {
        payload.rccmDocumentBase64 = pendingPdfBase64;
      }
      // Si pendingPdfBase64 est null (aucun changement), on omet le champ
      // pour que la route serveur conserve le document déjà en place.

      const res = await fetch("/api/company/legal-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, uid: user.uid, legalInfo: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la sauvegarde");

      show("Informations légales mises à jour", "success");
      setPendingPdfBase64(null);
      setPdfFileName(null);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const willRemoveExistingPdf = pendingPdfBase64 === "__DELETE__";
  const hasNewPdf = Boolean(pendingPdfBase64 && pendingPdfBase64 !== "__DELETE__");

  return (
    <div className="space-y-5">
      <div className="card-base p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <FileText size={18} className="text-brand-700" />
          <p className="font-medium text-ink-900">Informations légales de l&apos;entreprise</p>
        </div>
        <p className="text-sm text-ink-500">
          Ces champs concernent uniquement les marchands enregistrés en tant qu&apos;entreprise. Si vous opérez en tant que particulier, vous pouvez laisser cette section vide.
        </p>

        {looksLikeIndividualSoFar && !form.ifuNumber && !form.rccmNumber && (
          <div className="flex items-center gap-2 text-xs text-ink-500 bg-ink-50 rounded-lg px-3 py-2">
            <User size={13} />
            Profil actuel : particulier (aucune information d&apos;entreprise enregistrée)
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Numéro IFU</label>
              <input
                type="text"
                value={form.ifuNumber}
                onChange={(e) => update("ifuNumber", e.target.value)}
                placeholder="Numéro d'identification fiscale"
                className="input-base font-mono text-sm"
              />
            </div>
            <div>
              <label className="label-base">Numéro RCCM</label>
              <input
                type="text"
                value={form.rccmNumber}
                onChange={(e) => update("rccmNumber", e.target.value)}
                placeholder="Numéro du registre du commerce"
                className="input-base font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Catégorie juridique</label>
              <input
                type="text"
                value={form.legalCategory}
                onChange={(e) => update("legalCategory", e.target.value)}
                placeholder="Établissement (Personne physique)"
                className="input-base"
              />
            </div>
            <div>
              <label className="label-base">Régime fiscal</label>
              <input
                type="text"
                value={form.taxRegime}
                onChange={(e) => update("taxRegime", e.target.value)}
                placeholder="Micro et petites entreprises"
                className="input-base"
              />
            </div>
          </div>

          <div>
            <label className="label-base">Nom complet du propriétaire / gérant</label>
            <input
              type="text"
              value={form.ownerFullName}
              onChange={(e) => update("ownerFullName", e.target.value)}
              placeholder="Nom et prénom(s)"
              className="input-base"
            />
          </div>

          <div>
            <label className="label-base">Adresse du principal établissement</label>
            <textarea
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Îlot, parcelle, ville, commune, pays…"
              rows={2}
              className="input-base h-auto py-2 resize-none"
            />
          </div>

          <div>
            <label className="label-base">Activité exercée</label>
            <textarea
              value={form.activityDescription}
              onChange={(e) => update("activityDescription", e.target.value)}
              placeholder="Décrivez les activités déclarées de votre entreprise"
              rows={2}
              className="input-base h-auto py-2 resize-none"
            />
          </div>

          {/* Upload du registre de commerce (RCCM) en PDF */}
          <div>
            <label className="label-base">Registre de commerce (RCCM) — PDF</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="rccm-pdf-input"
            />

            {!hasNewPdf && !hasExistingPdf && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPdf}
                className="btn-secondary w-full justify-center"
              >
                {uploadingPdf ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Choisir un fichier PDF
              </button>
            )}

            {!hasNewPdf && hasExistingPdf && !willRemoveExistingPdf && (
              <div className="flex items-center justify-between bg-success-50 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm text-success-800">
                  <CheckCircle2 size={15} />
                  Document RCCM déjà enregistré
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-brand-600 font-medium hover:text-brand-700">
                    Remplacer
                  </button>
                  <button type="button" onClick={removePendingOrExistingPdf} className="text-ink-400 hover:text-danger-600">
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            {willRemoveExistingPdf && (
              <div className="flex items-center justify-between bg-warning-50 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm text-warning-800">
                  <AlertTriangle size={15} />
                  Le document sera supprimé à l&apos;enregistrement
                </div>
                <button
                  type="button"
                  onClick={() => setPendingPdfBase64(null)}
                  className="text-xs text-brand-600 font-medium hover:text-brand-700"
                >
                  Annuler
                </button>
              </div>
            )}

            {hasNewPdf && (
              <div className="flex items-center justify-between bg-brand-50 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm text-brand-800 truncate">
                  <FileText size={15} className="shrink-0" />
                  <span className="truncate">{pdfFileName}</span>
                  <span className="text-xs text-brand-600 shrink-0">
                    ({pendingPdfBase64 ? formatKb(pendingPdfBase64.length) : 0} Ko)
                  </span>
                </div>
                <button type="button" onClick={removePendingOrExistingPdf} className="text-ink-400 hover:text-danger-600 shrink-0">
                  <X size={15} />
                </button>
              </div>
            )}

            <p className="text-xs text-ink-400 mt-1.5">
              PDF uniquement, environ 370 Ko maximum (~500 Ko une fois encodé). Compressez votre document si besoin avant l&apos;envoi.
            </p>
          </div>

          <button type="submit" disabled={saving || uploadingPdf} className="btn-primary">
            {saving && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </form>
      </div>

      <KycExtractedDataCard company={company} />
    </div>
  );
}

/**
 * Affiche les données d'identité extraites automatiquement par le webhook
 * KYC (OCR + face match + AML) lors de la vérification VerifyPro. Lecture
 * seule — ces champs ne sont jamais modifiables manuellement, ils reflètent
 * exactement ce que le prestataire a extrait du document soumis.
 */
function KycExtractedDataCard({ company }: { company: Company }) {
  const data = company.kycExtractedData;
  if (!data) return null;

  const rows: { label: string; value: string | null }[] = [
    { label: "Prénom", value: data.firstName ?? null },
    { label: "Nom", value: data.lastName ?? null },
    { label: "Date de naissance", value: data.birthDate ?? null },
    { label: "N° document", value: data.docNumber ?? null },
    { label: "Type de document", value: data.documentType ?? null },
    { label: "Expiration", value: data.expiryDate ?? null },
    { label: "Nationalité", value: data.nationality ?? null },
    { label: "Adresse", value: data.address ?? null },
  ];

  return (
    <div className="card-base p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={18} className="text-brand-700" />
        <p className="font-medium text-ink-900">Données extraites (vérification d&apos;identité)</p>
      </div>
      <p className="text-sm text-ink-500">
        Ces informations ont été extraites automatiquement lors de votre vérification KYC. Elles ne sont pas modifiables ici.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {rows
          .filter((r) => r.value)
          .map((r) => (
            <div key={r.label}>
              <p className="text-xs text-ink-500 mb-0.5">{r.label}</p>
              <p className="font-medium text-ink-900">{r.value}</p>
            </div>
          ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-ink-100">
        {data.documentExpired === false && (
          <span className="badge bg-success-50 text-success-900 text-xs">Document non expiré</span>
        )}
        {data.documentExpired === true && (
          <span className="badge bg-danger-50 text-danger-900 text-xs">Document expiré</span>
        )}
        {data.tamperingDetected === false && (
          <span className="badge bg-success-50 text-success-900 text-xs">Aucune falsification détectée</span>
        )}
        {data.tamperingDetected === true && (
          <span className="badge bg-danger-50 text-danger-900 text-xs">Falsification détectée</span>
        )}
        {typeof data.confidenceScore === "number" && (
          <span className="badge bg-ink-100 text-ink-700 text-xs">
            Confiance OCR {Math.round(data.confidenceScore * 100)}%
          </span>
        )}
        {typeof data.faceMatchScore === "number" && (
          <span className="badge bg-ink-100 text-ink-700 text-xs">
            Correspondance visage {Math.round(data.faceMatchScore * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}