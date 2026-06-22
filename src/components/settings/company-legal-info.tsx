"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Loader2, FileText } from "lucide-react";
import type { Company } from "@/types";

export function CompanyLegalInfo({ company }: { company: Company }) {
  const { show } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ifuNumber: company.legalInfo?.ifuNumber ?? "",
    rccmNumber: company.legalInfo?.rccmNumber ?? "",
    legalCategory: company.legalInfo?.legalCategory ?? "",
    taxRegime: company.legalInfo?.taxRegime ?? "",
    ownerFullName: company.legalInfo?.ownerFullName ?? "",
    address: company.legalInfo?.address ?? "",
    activityDescription: company.legalInfo?.activityDescription ?? "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, "companies", company.id), { legalInfo: form });
      show("Informations légales mises à jour", "success");
    } catch {
      show("Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-base p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <FileText size={18} className="text-brand-700" />
        <p className="font-medium text-ink-900">Informations légales de l&apos;entreprise</p>
      </div>
      <p className="text-sm text-ink-500">
        Ces informations doivent correspondre à votre Attestation IFU et votre extrait RCCM. Elles peuvent être demandées lors de contrôles de conformité.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">Numéro IFU</label>
            <input
              type="text"
              value={form.ifuNumber}
              onChange={(e) => update("ifuNumber", e.target.value)}
              placeholder="0202214354454"
              className="input-base font-mono text-sm"
            />
          </div>
          <div>
            <label className="label-base">Numéro RCCM</label>
            <input
              type="text"
              value={form.rccmNumber}
              onChange={(e) => update("rccmNumber", e.target.value)}
              placeholder="RB/ABC/24 A 112271"
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

        <button type="submit" disabled={saving} className="btn-primary">
          {saving && <Loader2 size={15} className="animate-spin" />}
          Enregistrer
        </button>
      </form>
    </div>
  );
}
