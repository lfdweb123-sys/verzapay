"use client";

import { useState } from "react";
import { ArrowLeft, Copy, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ImageUploadField } from "@/components/payments/image-upload-field";
import { TransactionTwoFactorModal } from "@/components/payments/transaction-two-factor-modal";
import { formatXOF } from "@/lib/utils";

export default function NewPaymentPage() {
  const { activeCompany } = useCompany();
  const { user, appUser } = useAuth();
  const { show } = useToast();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [result, setResult] = useState<{ checkoutUrl: string; paymentId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const requires2FA = appUser?.transactionTwoFactorEnabled !== false;

  if (activeCompany?.kycStatus !== "approved") {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Link href="/payments" className="btn-ghost -ml-1"><ArrowLeft size={16} /> Retour</Link>
        <div className="card-base p-8 text-center">
          <p className="text-lg font-medium text-ink-900">KYC requis</p>
          <p className="text-sm text-ink-500 mt-2">Vous devez compléter la vérification KYC avant de créer des paiements.</p>
          <Link href={`/kyc-pending?companyId=${activeCompany?.id}`} className="btn-primary mt-4 mx-auto">Vérifier maintenant</Link>
        </div>
      </div>
    );
  }

  function handleSubmitClick(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum < 100) { show("Montant minimum : 100 XOF", "error"); return; }

    if (requires2FA) {
      setShow2FA(true);
    } else {
      executeCreatePayment();
    }
  }

  async function executeCreatePayment() {
    if (!activeCompany || !user) return;
    const amountNum = parseFloat(amount);
    setLoading(true);
    try {
      const res = await fetch("/api/payments-engine/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompany.id,
          amount: amountNum,
          currency: "XOF",
          description: description || "Paiement Verzapay",
          customerName,
          customerPhone,
          imageBase64,
          uid: user.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      setResult({ checkoutUrl: data.checkoutUrl, paymentId: data.paymentId });
      setShow2FA(false);
      show("Lien de paiement créé avec succès", "success");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  function handle2FAVerified() {
    setShow2FA(false);
    executeCreatePayment();
  }

  function copyLink() {
    if (!result) return;
    navigator.clipboard.writeText(result.checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    show("Lien copié !", "success");
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/payments" className="btn-ghost -ml-1"><ArrowLeft size={16} /></Link>
        <h1 className="text-lg font-medium text-ink-900">Créer un lien de paiement</h1>
      </div>

      {!result ? (
        <form onSubmit={handleSubmitClick} className="card-base p-5 space-y-4">
          <div>
            <label className="label-base">Montant (XOF) *</label>
            <input type="number" min="100" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25 000" className="input-base" />
          </div>
          <div>
            <label className="label-base">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex : Commande #1234" className="input-base" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-base">Nom du client</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Kofi Mensah" className="input-base" />
            </div>
            <div>
              <label className="label-base">Téléphone</label>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+229 96 00 00 00" className="input-base" />
            </div>
          </div>
          <ImageUploadField value={imageBase64} onChange={setImageBase64} />
          <p className="text-xs text-ink-500 bg-ink-50 rounded-lg p-3">
            Mobile Money et carte bancaire acceptés. Une commission de <strong>{((activeCompany?.commissionRate ?? 0.015) * 100).toFixed(1)}%</strong> sera prélevée sur chaque paiement réussi.
          </p>
          {requires2FA && (
            <p className="text-xs text-ink-400 bg-ink-50 rounded-lg p-2.5">
              Un code de vérification vous sera envoyé par email pour confirmer la création de ce lien.
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Créer le lien de paiement
          </button>
        </form>
      ) : (
        <div className="card-base p-5 space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} className="text-success-700" />
          </div>
          <div>
            <p className="font-medium text-ink-900">Lien créé avec succès</p>
            <p className="text-sm text-ink-500 mt-1">Partagez ce lien avec votre client pour encaisser le paiement.</p>
          </div>
          <div className="bg-ink-50 rounded-lg p-3 text-sm text-ink-700 break-all text-left font-mono text-xs">
            {result.checkoutUrl}
          </div>
          <div className="flex gap-2">
            <button onClick={copyLink} className="btn-secondary flex-1">
              {copied ? <CheckCircle2 size={15} className="text-success-700" /> : <Copy size={15} />}
              {copied ? "Copié !" : "Copier"}
            </button>
            <a href={result.checkoutUrl} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1">
              <ExternalLink size={15} /> Ouvrir
            </a>
          </div>
          <button onClick={() => { setResult(null); setAmount(""); setDescription(""); setCustomerName(""); setCustomerPhone(""); setImageBase64(null); }} className="btn-ghost text-sm">
            Créer un autre lien
          </button>
        </div>
      )}

      <TransactionTwoFactorModal
        open={show2FA}
        actionLabel={`paiement de ${formatXOF(parseFloat(amount) || 0)}`}
        onClose={() => setShow2FA(false)}
        onVerified={handle2FAVerified}
      />
    </div>
  );
}
