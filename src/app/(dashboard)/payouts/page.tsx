"use client";

import { CurrencySelect } from "@/components/ui/currency-select";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth-context";
import { usePreferences } from "@/lib/preferences-context";
import { useToast } from "@/components/ui/toast";
import { PayoutBadge, EmptyState, Spinner } from "@/components/ui/badges";
import { TransactionTwoFactorModal } from "@/components/payments/transaction-two-factor-modal";
import { ArrowUpRight, Plus, X, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Payout } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

export default function PayoutsPage() {
  const { activeCompany } = useCompany();
  const { user, appUser } = useAuth();
  const { formatAmount } = usePreferences();
  const { show } = useToast();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const pg = usePagination(payouts, 20);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [amount, setAmount] = useState("");
  const [poCurrency, setPoCurrency] = useState("XOF");
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Virement bancaire
  const [method, setMethod] = useState<"mobile_money" | "bank_transfer">("mobile_money");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [iban, setIban] = useState("");
  const [bicSwift, setBicSwift] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  // Réseau (opérateur) saisi par l'utilisateur, ex. "Moov BJ", "MTN BJ"
  const [operator, setOperator] = useState("");
  // Bénéficiaires enregistrés (valeurs masquées côté navigateur)
  type SavedBeneficiary = { id: string; type: "mobile_money" | "bank_transfer"; name: string; phoneMasked: string; operator: string | null; bankName: string | null; holder: string | null; accountMasked: string };
  const [beneficiaries, setBeneficiaries] = useState<SavedBeneficiary[]>([]);
  const [selectedBen, setSelectedBen] = useState<SavedBeneficiary | null>(null);
  const [showBens, setShowBens] = useState(false);
  const [verified, setVerified] = useState(false);

  const requires2FA = appUser?.transactionTwoFactorEnabled !== false;

  useEffect(() => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, "companies", activeCompany.id, "payouts"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(q, (snap) => {
      setPayouts(snap.docs.map((d) => d.data() as Payout));
      setLoading(false);
    });
  }, [activeCompany?.id]);

  // Bénéficiaires enregistrés : chargés à l'ouverture de la fenêtre
  useEffect(() => {
    if (!showModal || !activeCompany || !user) return;
    fetch(`/api/beneficiaries?companyId=${activeCompany.id}&uid=${user.uid}`)
      .then((r) => (r.ok ? r.json() : { beneficiaries: [] }))
      .then((d) => setBeneficiaries(d.beneficiaries ?? []))
      .catch(() => setBeneficiaries([]));
  }, [showModal, activeCompany?.id, user?.uid]);

  function pickBeneficiary(b: SavedBeneficiary) {
    setSelectedBen(b);
    setMethod(b.type);
    setRecipientName(b.name);
    setShowBens(false);
  }
  function clearBeneficiary() {
    setSelectedBen(null);
    setPhone(""); setOperator(""); setRecipientName("");
    setBankName(""); setAccountHolder(""); setIban(""); setBicSwift(""); setAccountNumber("");
  }

  function handleSubmitClick(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { show("Saisissez un montant valide", "error"); return; }
    // Hors XOF, la vérification (minimum 500 XOF, solde) se fait côté serveur sur l'équivalent converti.
    if (poCurrency === "XOF" && amountNum < 500) { show("Montant minimum : 500 XOF", "error"); return; }
    if (poCurrency === "XOF" && amountNum > (activeCompany?.walletBalance ?? 0)) { show("Solde insuffisant", "error"); return; }
    if (!verified) { show("Cochez la case pour confirmer que vous avez vérifié les informations", "error"); return; }
    if (!selectedBen && !phone) {
      show(method === "bank_transfer" ? "Renseignez le téléphone du bénéficiaire" : "Renseignez le numéro Mobile Money du bénéficiaire", "error");
      return;
    }
    if (!selectedBen && method === "bank_transfer") {
      if (!bankName.trim() || !accountHolder.trim()) { show("Renseignez la banque et le titulaire du compte", "error"); return; }
      if (!iban.trim() && !accountNumber.trim()) { show("Renseignez l'IBAN ou le numéro de compte", "error"); return; }
    }

    if (requires2FA) {
      setShow2FA(true);
    } else {
      executePayout();
    }
  }

  async function executePayout() {
    if (!activeCompany || !user) return;
    const amountNum = parseFloat(amount);
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments-engine/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompany.id, amount: amountNum, currency: poCurrency, recipientPhone: phone, recipientName, note, uid: user.uid,
          beneficiaryId: selectedBen?.id,
          recipientOperator: method === "mobile_money" && operator.trim() ? operator.trim() : undefined,
          method,
          bank: !selectedBen && method === "bank_transfer"
            ? { bankName: bankName.trim(), accountHolderName: accountHolder.trim(), iban: iban.trim() || null, bicSwift: bicSwift.trim() || null, accountNumber: accountNumber.trim() || null }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      show("Demande de retrait envoyée", "success");
      setShowModal(false);
      setShow2FA(false);
      setAmount(""); setPhone(""); setRecipientName(""); setNote("");
      setBankName(""); setAccountHolder(""); setIban(""); setBicSwift(""); setAccountNumber("");
      setOperator(""); setSelectedBen(null); setVerified(false);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handle2FAVerified() {
    setShow2FA(false);
    executePayout();
  }

  const canPayout = activeCompany?.kycStatus === "approved";
  const hasBalance = (activeCompany?.walletBalance ?? 0) > 0;
  const canOpenPayout = canPayout && hasBalance;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-ink-900">Paiements sortants</h1>
          <p className="text-sm text-ink-500">{activeCompany?.name}</p>
        </div>
        {canPayout && (
          <button
            onClick={() => canOpenPayout && setShowModal(true)}
            disabled={!hasBalance}
            title={!hasBalance ? "Solde insuffisant pour effectuer un retrait" : undefined}
            className="btn-primary h-9 text-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={15} />
            <span className="sm:hidden">Envoyer</span>
            <span className="hidden sm:inline">Envoyer un paiement</span>
          </button>
        )}
      </div>

      <div className="card-base p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-500">Solde disponible</p>
          <p className="text-2xl font-medium text-ink-900 tabular-nums mt-0.5">
            {formatAmount(activeCompany?.walletBalance ?? 0)}
          </p>
        </div>
        {canPayout && (
          <button
            onClick={() => canOpenPayout && setShowModal(true)}
            disabled={!hasBalance}
            title={!hasBalance ? "Solde insuffisant pour effectuer un retrait" : undefined}
            className="btn-primary text-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Retirer des fonds
          </button>
        )}
      </div>

      <div className="card-base overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100">
          <p className="text-sm font-medium">Historique des décaissements</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : payouts.length === 0 ? (
          <EmptyState title="Aucun décaissement" description="Votre historique de retraits apparaîtra ici." icon={ArrowUpRight} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Bénéficiaire</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Statut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ink-500">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ink-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {pg.pageItems.map((po) => (
                  <tr key={po.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-ink-900">{po.recipientName ?? "—"}</p>
                      <p className="text-xs text-ink-500">{po.method === "bank_transfer" ? `${po.recipientBank ?? "Virement bancaire"}${po.recipientAccountLast4 ? ` ••${po.recipientAccountLast4}` : ""}` : (po.recipientPhone ?? "")}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><PayoutBadge status={po.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{formatDateTime(po.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums text-danger-700">-{formatAmount(po.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:w-1/2 sm:min-w-[420px] max-h-[92dvh] flex flex-col shadow-popover animate-slide-up">
            <div className="shrink-0 bg-white rounded-t-2xl flex items-center justify-between px-5 py-4 border-b border-ink-100">
              <p className="font-medium text-ink-900">Envoyer un paiement</p>
              <button onClick={() => setShowModal(false)} className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitClick} className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
              <div className="bg-ink-50 rounded-lg p-3 text-center">
                <p className="text-xs text-ink-500">Solde disponible</p>
                <p className="font-medium text-ink-900 tabular-nums">{formatAmount(activeCompany?.walletBalance ?? 0)}</p>
              </div>
              <div>
                <label className="label-base">Montant *</label>
                <div className="flex gap-2">
                  <input type="number" min="0" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10 000" className="input-base" />
                  <div className="w-28 shrink-0"><CurrencySelect value={poCurrency} onChange={setPoCurrency} /></div>
                </div>
                <p className="text-xs text-ink-500 mt-1">Le bénéficiaire reçoit dans la devise de son pays ; votre solde (XOF) est débité de l&apos;équivalent.</p>
              </div>
              {beneficiaries.length > 0 && !selectedBen && (
                <div>
                  <button type="button" onClick={() => setShowBens((v) => !v)} className="btn-secondary text-sm w-full justify-center">
                    Choisir un bénéficiaire enregistré ({beneficiaries.length})
                  </button>
                  {showBens && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-ink-200 divide-y divide-ink-50">
                      {beneficiaries.map((b) => (
                        <button key={b.id} type="button" onClick={() => pickBeneficiary(b)} className="w-full text-left px-3 py-2.5 hover:bg-ink-50 transition-colors">
                          <p className="text-sm font-medium text-ink-900">{b.name || (b.type === "bank_transfer" ? b.holder : "Bénéficiaire")}</p>
                          <p className="text-xs text-ink-500">
                            {b.type === "bank_transfer"
                              ? `Virement · ${b.bankName ?? ""} · ${b.accountMasked}`
                              : `Mobile Money · ${b.operator ?? "réseau"} · ${b.phoneMasked}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedBen && (
                <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{selectedBen.name || selectedBen.holder || "Bénéficiaire enregistré"}</p>
                    <p className="text-xs text-ink-600 mt-0.5">
                      {selectedBen.type === "bank_transfer"
                        ? `Virement bancaire · ${selectedBen.bankName ?? ""} · ${selectedBen.accountMasked}`
                        : `Mobile Money · ${selectedBen.operator ?? "réseau"} · ${selectedBen.phoneMasked}`}
                    </p>
                    <p className="text-[11px] text-ink-400 mt-1">Les informations sont masquées pour votre sécurité.</p>
                  </div>
                  <button type="button" onClick={clearBeneficiary} className="text-xs text-brand-700 hover:underline shrink-0">Changer</button>
                </div>
              )}
              <div className={selectedBen ? "hidden" : "space-y-4"}>
              <div>
                <label className="label-base">Mode de décaissement</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod("mobile_money")}
                    className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-colors ${method === "mobile_money" ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
                  >
                    Mobile Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("bank_transfer")}
                    className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-colors ${method === "bank_transfer" ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
                  >
                    Virement bancaire
                  </button>
                </div>
              </div>
              <div>
                <label className="label-base">{method === "bank_transfer" ? "Téléphone du bénéficiaire *" : "Téléphone Mobile Money *"}</label>
                <input type="tel" required={!selectedBen} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 96 00 00 00" className="input-base" />
                {method === "bank_transfer" && (
                  <p className="text-xs text-ink-400 mt-1.5">Son indicatif détermine le pays de la banque.</p>
                )}
              </div>
              {method === "bank_transfer" && (
                <div className="space-y-3 rounded-lg border border-ink-200 p-3">
                  <div>
                    <label className="label-base">Banque *</label>
                    <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Nom de la banque" className="input-base" />
                  </div>
                  <div>
                    <label className="label-base">Titulaire du compte *</label>
                    <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Nom complet" className="input-base" />
                  </div>
                  <div>
                    <label className="label-base">IBAN</label>
                    <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="BJ00 0000 0000 0000 0000 0000 0000" className="input-base" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-base">Numéro de compte</label>
                      <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="input-base" />
                    </div>
                    <div>
                      <label className="label-base">BIC / SWIFT</label>
                      <input type="text" value={bicSwift} onChange={(e) => setBicSwift(e.target.value)} className="input-base" />
                    </div>
                  </div>
                  <p className="text-xs text-ink-400">Renseignez l&apos;IBAN ou le numéro de compte.</p>
                  <p className="text-xs text-warning-900 bg-warning-50 rounded-lg px-3 py-2">
                    Les virements bancaires sont <strong>traités manuellement</strong> par notre équipe, pas automatiquement. Le montant est réservé sur votre portefeuille et vous êtes notifié dès que le virement est effectué.
                  </p>
                </div>
              )}
              {method === "mobile_money" && (
                <div>
                  <label className="label-base">Réseau du bénéficiaire *</label>
                  <input
                    type="text"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    required={!selectedBen && method === "mobile_money"}
                    placeholder="Ex : Moov BJ, MTN BJ, Orange CI…"
                    className="input-base"
                  />
                  <p className="text-xs text-ink-400 mt-1.5">Saisissez le réseau du numéro (opérateur Mobile Money). Il sera enregistré avec le numéro.</p>
                </div>
              )}
              </div>
              <div>
                <label className="label-base">Nom du bénéficiaire</label>
                <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Kofi Mensah" className="input-base" />
              </div>
              <div>
                <label className="label-base">Note (optionnel)</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Raison du virement" className="input-base" />
              </div>
              {requires2FA && (
                <p className="text-xs text-ink-400 bg-ink-50 rounded-lg p-2.5">
                  Un code de vérification vous sera envoyé par email pour confirmer ce retrait.
                </p>
              )}
              <label className="flex items-start gap-2.5 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2.5 text-xs text-warning-900 cursor-pointer">
                <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 rounded shrink-0" />
                <span>
                  <strong>Vérifiez bien les informations avant d&apos;envoyer.</strong> Le numéro, le réseau et les coordonnées bancaires doivent être exacts : un retrait envoyé vers de mauvaises coordonnées peut être impossible à récupérer. J&apos;ai vérifié les informations ci-dessus.
                </span>
              </label>
              </div>

              {/* Boutons toujours visibles, même sur mobile (barre fixe en bas de la fenêtre) */}
              <div className="shrink-0 flex gap-2 border-t border-ink-100 bg-white px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annuler</button>
                <button type="submit" disabled={submitting || !verified} className="btn-primary flex-1 disabled:opacity-50">
                  {submitting && <Loader2 size={15} className="animate-spin" />}
                  Envoyer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TransactionTwoFactorModal
        open={show2FA}
        actionLabel={`retrait de ${poCurrency === "XOF" ? formatAmount(parseFloat(amount) || 0) : `${(parseFloat(amount) || 0).toLocaleString("fr-FR")} ${poCurrency}`}`}
        onClose={() => setShow2FA(false)}
        onVerified={handle2FAVerified}
      />

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}