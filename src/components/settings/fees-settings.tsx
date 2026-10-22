"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Coins, Info, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

type Bearer = "MERCHANT" | "CUSTOMER";

interface Option {
  value: Bearer;
  title: string;
  description: string;
}

const COLLECTION_OPTIONS: Option[] = [
  { value: "MERCHANT", title: "Frais à votre charge", description: "Le client paie le montant exact, les frais sont déduits de ce que vous recevez." },
  { value: "CUSTOMER", title: "À la charge du client", description: "Les frais sont ajoutés au montant que le client doit payer." },
];

const PAYOUT_OPTIONS: Option[] = [
  { value: "MERCHANT", title: "Frais à votre charge", description: "Le montant débité inclut les frais, le bénéficiaire reçoit le montant exact." },
  { value: "CUSTOMER", title: "À la charge du bénéficiaire", description: "Les frais sont déduits du montant envoyé au bénéficiaire." },
];

function OptionGrid({
  options, value, disabled, onChange,
}: { options: Option[]; value: Bearer; disabled: boolean; onChange: (v: Bearer) => void }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-start gap-3 text-left rounded-xl border px-4 py-3.5 transition-colors disabled:opacity-60",
              selected ? "border-brand-700 bg-brand-50" : "border-ink-200 hover:bg-ink-50"
            )}
          >
            <span className="mt-1.5 w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {selected && <span className="w-1.5 h-1.5 rounded-full bg-brand-700" />}
            </span>
            <span>
              <span className="block text-sm font-medium text-ink-900">{o.title}</span>
              <span className="block text-xs text-ink-500 mt-0.5">{o.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FeesSettings({ company }: { company: Company }) {
  const { show } = useToast();
  const [saving, setSaving] = useState(false);
  const [collection, setCollection] = useState<Bearer>(company.feesCollection ?? "MERCHANT");
  const [payout, setPayout] = useState<Bearer>(company.feesPayout ?? "MERCHANT");

  async function save(field: "feesCollection" | "feesPayout", value: Bearer) {
    const previous = field === "feesCollection" ? collection : payout;
    if (field === "feesCollection") setCollection(value); else setPayout(value);
    setSaving(true);
    try {
      await updateDoc(doc(db, "companies", company.id), { [field]: value });
      show("Frais à charge mis à jour", "success");
    } catch {
      if (field === "feesCollection") setCollection(previous); else setPayout(previous);
      show("Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium text-ink-900">
          <Coins size={20} /> Frais à charge
        </h2>
        <p className="text-sm text-ink-500 mt-1">Choisissez qui supporte les frais Verzapay pour chaque type d&apos;opération.</p>
      </div>

      <div className="card-base p-3.5 flex items-center gap-3 text-sm text-ink-600">
        <Info size={16} className="shrink-0" />
        Ce paramètre s&apos;applique par défaut à toutes les nouvelles opérations. Vous pouvez le modifier ponctuellement lors de la création d&apos;un paiement.
      </div>

      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
          <ArrowDownLeft size={14} className="text-success-700" /> Encaissements (encaissement)
        </p>
        <OptionGrid options={COLLECTION_OPTIONS} value={collection} disabled={saving} onChange={(v) => save("feesCollection", v)} />
      </div>

      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
          <ArrowUpRight size={14} className="text-brand-700" /> Décaissements (décaissement)
        </p>
        <OptionGrid options={PAYOUT_OPTIONS} value={payout} disabled={saving} onChange={(v) => save("feesPayout", v)} />
      </div>
    </div>
  );
}
