"use client";

import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";

type StatementType = "transactions" | "payouts" | "ledger";

/** Boutons d'export (PDF / Excel) d'un relevé sur les 30 derniers jours ou la période choisie. */
export function ExportMenu({ type }: { type: StatementType }) {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(format: "pdf" | "xlsx") {
    if (!user || !activeCompany) return;
    setBusy(format);
    try {
      const to = Date.now();
      const res = await fetch("/api/export/statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, companyId: activeCompany.id, type, format, from: to - days * 24 * 3600 * 1000, to }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `releve-${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary text-sm"><Download size={15} /> Exporter</button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 z-30 rounded-xl border border-ink-200 bg-white shadow-popover p-3 space-y-3">
          <div>
            <label className="label-base">Période</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input-base">
              <option value={7}>7 derniers jours</option>
              <option value={30}>30 derniers jours</option>
              <option value={90}>90 derniers jours</option>
              <option value={365}>12 derniers mois</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => download("pdf")} disabled={!!busy} className="btn-secondary flex-1 justify-center text-sm">
              {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
            </button>
            <button type="button" onClick={() => download("xlsx")} disabled={!!busy} className="btn-secondary flex-1 justify-center text-sm">
              {busy === "xlsx" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
