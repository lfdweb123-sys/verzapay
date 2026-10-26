"use client";

import { useState } from "react";
import { ExternalLink, Loader2, FlaskConical } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";

// Page de TEST du checkout hébergé (isolée : n'affecte ni les liens ni les paiements existants).
export default function CheckoutTestPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const [amount, setAmount] = useState("1000");
  const [name, setName] = useState("Client Test");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("Test du checkout Verzapay");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeCompany) return;
    setBusy(true);
    setUrl(null);
    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, companyId: activeCompany.id, amount: Number(amount), customerName: name, customerPhone: phone, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setUrl(data.url);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-lg font-medium text-ink-900"><FlaskConical size={18} /> Test du checkout hébergé</h1>
        <p className="text-sm text-ink-500 mt-1">Crée un vrai paiement en attente et ouvre la nouvelle page de paiement Verzapay. Les liens actuels ne sont pas modifiés.</p>
      </div>
      <form onSubmit={create} className="card-base p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label-base">Montant *</label><input type="number" min="100" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input-base" /></div>
          <div><label className="label-base">Téléphone du client * (international)</label><input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+22951345789" className="input-base" /></div>
        </div>
        <div><label className="label-base">Nom du client</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-base" /></div>
        <div><label className="label-base">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input-base" /></div>
        <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
          {busy && <Loader2 size={15} className="animate-spin" />} Créer la page de paiement
        </button>
      </form>
      {url && (
        <div className="card-base p-4 space-y-2">
          <p className="text-sm font-medium text-ink-900">Page de paiement créée</p>
          <p className="text-xs font-mono text-ink-600 break-all select-all">{url}</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex"><ExternalLink size={15} /> Ouvrir le checkout</a>
        </div>
      )}
    </div>
  );
}
