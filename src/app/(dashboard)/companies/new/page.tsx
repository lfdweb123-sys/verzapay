"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

const SECTORS = ["E-commerce", "Restauration", "Santé", "Éducation", "Transport", "Services financiers", "Immobilier", "Technologie", "Agriculture", "Autre"];
const COUNTRIES = ["BJ", "SN", "CI", "ML", "BF", "TG", "GN", "GW", "NE", "MR"];
const COUNTRY_LABELS: Record<string, string> = {
  BJ: "Bénin", SN: "Sénégal", CI: "Côte d'Ivoire", ML: "Mali", BF: "Burkina Faso",
  TG: "Togo", GN: "Guinée", GW: "Guinée-Bissau", NE: "Niger", MR: "Mauritanie",
};

export default function NewCompanyPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("BJ");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/companies/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, name, legalName, sector, country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la création");
      show("Entreprise créée avec succès", "success");
      router.push(`/kyc-pending?companyId=${data.companyId}`);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="btn-ghost -ml-1"><ArrowLeft size={16} /></Link>
        <h1 className="text-lg font-medium text-ink-900">Créer une entreprise</h1>
      </div>

      <div className="card-base p-5 space-y-4">
        <p className="text-sm text-ink-500">Chaque entreprise dispose de son propre espace KYC et de ses propres clés de paiement.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-base">Nom de l'entreprise *</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Boutique Kofi" className="input-base" />
          </div>
          <div>
            <label className="label-base">Raison sociale (optionnel)</label>
            <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="SARL Boutique Kofi" className="input-base" />
          </div>
          <div>
            <label className="label-base">Secteur d'activité</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)} className="input-base">
              <option value="">Sélectionner un secteur</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label-base">Pays *</label>
            <select required value={country} onChange={(e) => setCountry(e.target.value)} className="input-base">
              {COUNTRIES.map((c) => <option key={c} value={c}>{COUNTRY_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm text-brand-800">
            Après la création, vous serez redirigé vers la vérification KYC. Cette étape est obligatoire pour activer les paiements.
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Créer et démarrer la vérification KYC
          </button>
        </form>
      </div>
    </div>
  );
}
