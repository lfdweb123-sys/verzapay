"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Copy, ExternalLink, Loader2, CheckCircle2, Smartphone, CreditCard, Landmark, Layers } from "lucide-react";
import Link from "next/link";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ImageUploadField } from "@/components/payments/image-upload-field";
import { TransactionTwoFactorModal } from "@/components/payments/transaction-two-factor-modal";
import { usePreferences } from "@/lib/preferences-context";

type PaymentChannel = "ANY" | "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER";

type AvailableChannel = { channel: string; name: string };

// Mappe un channel JoonaPay vers son icône
function iconForChannel(channel: string) {
  if (channel === "CREDIT_CARD") return CreditCard;
  if (channel === "BANK_TRANSFER") return Landmark;
  return Smartphone;
}

export default function NewPaymentPage() {
  const { activeCompany } = useCompany();
  const { formatAmount } = usePreferences();
  const { user, appUser } = useAuth();
  const { show } = useToast();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  // Pré-sélection par défaut : "ANY" — le client voit toutes les méthodes
  // actives sur la page JoonaPay et choisit lui-même. Le marchand peut
  // restreindre à une méthode précise s'il le souhaite.
  const [channel, setChannel] = useState<PaymentChannel>("ANY");
  const [loading, setLoading] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [result, setResult] = useState<{ checkoutUrl: string; paymentId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Méthodes réellement actives sur le compte JoonaPay du marchand pour son pays
  const [availableChannels, setAvailableChannels] = useState<AvailableChannel[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);

  const requires2FA = appUser?.transactionTwoFactorEnabled !== false;

  useEffect(() => {
    if (!activeCompany || !user) return;
    setMethodsLoading(true);
    fetch(`/api/payments-engine/methods?companyId=${activeCompany.id}&uid=${user.uid}`)
      .then((r) => r.json())
      .then((data) => setAvailableChannels(data.methods ?? []))
      .catch(() => setAvailableChannels([]))
      .finally(() => setMethodsLoading(false));
  }, [activeCompany?.id, user?.uid]);

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

  function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function handleSubmitClick(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum < 100) { show("Montant minimum : 100 XOF", "error"); return; }

    if (customerEmail.trim() && !isValidEmail(customerEmail.trim())) {
      show("Adresse email invalide", "error");
      return;
    }

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
          customerEmail: customerEmail.trim() || undefined,
          imageBase64,
          uid: user.uid,
          channel, // "ANY" | "MOBILE_MONEY" | "CREDIT_CARD" | "BANK_TRANSFER"
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      setResult({ checkoutUrl: data.checkoutUrl, paymentId: data.paymentId });
      setShow2FA(false);
      show(
        customerEmail.trim()
          ? "Lien de paiement créé et envoyé par email au client"
          : "Lien de paiement créé avec succès",
        "success"
      );
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

  function resetForm() {
    setResult(null);
    setAmount("");
    setDescription("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setImageBase64(null);
    setChannel("ANY");
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label-base">Nom du client</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Kofi Mensah" className="input-base" />
            </div>
            <div>
              <label className="label-base">Téléphone</label>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+229 96 00 00 00" className="input-base" />
            </div>
          </div>
          <div>
            <label className="label-base">Email du client (optionnel)</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="client@email.com"
              className="input-base"
            />
            <p className="text-xs text-ink-400 mt-1.5">
              Si renseigné, le client recevra automatiquement le lien de paiement par email.
            </p>
          </div>

          <div>
            <label className="label-base">Méthode de paiement</label>

            {methodsLoading ? (
              <div className="flex items-center gap-2 text-xs text-ink-400 py-3">
                <Loader2 size={14} className="animate-spin" /> Chargement des méthodes disponibles...
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Option "Toutes les méthodes" toujours présente */}
                <button
                  type="button"
                  onClick={() => setChannel("ANY")}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-3 px-2 text-xs font-medium transition-colors ${
                    channel === "ANY" ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"
                  }`}
                >
                  <Layers size={18} />
                  <span>Toutes les méthodes</span>
                  <span className="text-[10px] text-ink-400 font-normal">Le client choisit</span>
                </button>

                {/* Méthodes réellement disponibles sur le compte JoonaPay du marchand */}
                {availableChannels.map((m) => {
                  const Icon = iconForChannel(m.channel);
                  const active = channel === m.channel;
                  return (
                    <button
                      key={m.channel}
                      type="button"
                      onClick={() => setChannel(m.channel as PaymentChannel)}
                      className={`flex flex-col items-center gap-1 rounded-xl border py-3 px-2 text-xs font-medium transition-colors ${
                        active ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"
                      }`}
                    >
                      <Icon size={18} />
                      <span>{m.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-ink-400 mt-1.5">
              {channel === "ANY"
                ? "Le client verra toutes les méthodes disponibles pour son pays sur la page de paiement et choisira lui-même."
                : "Le lien forcera cette méthode précise. Si elle n'est pas disponible pour le pays du client, la création échouera."}
            </p>
          </div>

          <ImageUploadField value={imageBase64} onChange={setImageBase64} />
          <p className="text-xs text-ink-500 bg-ink-50 rounded-lg p-3">
            Mobile Money, carte bancaire et virement acceptés selon votre configuration JoonaPay. Une commission de <strong>{((activeCompany?.commissionRate ?? 0.015) * 100).toFixed(1)}%</strong> sera prélevée sur chaque paiement réussi.
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
            <p className="text-sm text-ink-500 mt-1">
              {customerEmail.trim()
                ? "Le lien a aussi été envoyé par email au client. Vous pouvez également le partager manuellement."
                : "Partagez ce lien avec votre client pour encaisser le paiement."}
            </p>
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
          <button onClick={resetForm} className="btn-ghost text-sm">
            Créer un autre lien
          </button>
        </div>
      )}

      <TransactionTwoFactorModal
        open={show2FA}
        actionLabel={`paiement de ${formatAmount(parseFloat(amount) || 0)}`}
        onClose={() => setShow2FA(false)}
        onVerified={handle2FAVerified}
      />
    </div>
  );
}