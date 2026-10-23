"use client";

import { useState } from "react";
import { Play, Loader2, FlaskConical } from "lucide-react";
import { CurrencySelect } from "@/components/ui/currency-select";

const PUBLIC_API_PATH = "/api/v1/payments";

export function ApiTester() {
  const [secretKey, setSecretKey] = useState("");
  const [amount, setAmount] = useState("1000");
  const [currency, setCurrency] = useState("XOF");
  const [customerName, setCustomerName] = useState("Test Verzapay");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("Test API");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ status: number; durationMs: number; body: string } | null>(null);

  const requestBody = {
    amount: Number(amount) || 0,
    currency,
    description,
    customer_name: customerName,
    customer_phone: customerPhone,
  };

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setResult(null);
    const started = Date.now();
    try {
      const res = await fetch(PUBLIC_API_PATH, {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* texte brut */ }
      setResult({ status: res.status, durationMs: Date.now() - started, body: pretty });
    } catch (err) {
      setResult({ status: 0, durationMs: Date.now() - started, body: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }

  const ok = result && result.status >= 200 && result.status < 300;

  return (
    <div className="card-base p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <FlaskConical size={18} className="text-brand-700" />
        <p className="font-medium text-ink-900">Tester l&apos;API</p>
      </div>
      <p className="text-sm text-ink-600">
        Envoyez une vraie requête <code className="font-mono">POST /payments</code> avec votre clé secrète et voyez la réponse.
        Un lien de paiement est réellement créé (statut « en attente ») : aucun argent n&apos;est débité tant que personne ne le règle.
      </p>

      <form onSubmit={run} className="space-y-3">
        <div>
          <label className="label-base">Clé secrète (vpz_sk_…) *</label>
          <input
            type="password" required value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
            placeholder="vpz_sk_..." autoComplete="off" className="input-base font-mono"
          />
          <p className="text-xs text-ink-400 mt-1.5">Elle est envoyée uniquement à l&apos;API Verzapay et n&apos;est pas conservée.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label-base">Montant *</label>
            <div className="flex gap-2"><input type="number" min="0" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input-base" /><div className="w-28 shrink-0"><CurrencySelect value={currency} onChange={setCurrency} /></div></div>
          </div>
          <div>
            <label className="label-base">Téléphone du client * (format international)</label>
            <input type="tel" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+22996000000" className="input-base" />
          </div>
          <div>
            <label className="label-base">Nom du client</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input-base" />
          </div>
          <div>
            <label className="label-base">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input-base" />
          </div>
        </div>

        <div>
          <p className="label-base">Requête envoyée</p>
          <pre className="bg-ink-900 text-ink-50 rounded-lg p-3 text-xs overflow-x-auto">{`POST ${PUBLIC_API_PATH}\nAuthorization: Bearer ${secretKey ? "vpz_sk_••••••••" : "vpz_sk_votre_cle"}\n\n${JSON.stringify(requestBody, null, 2)}`}</pre>
        </div>

        <button type="submit" disabled={running} className="btn-primary">
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          Envoyer la requête
        </button>
      </form>

      {result && (
        <div>
          <p className="label-base">
            Réponse —{" "}
            <span className={ok ? "text-success-700" : "text-danger-700"}>
              {result.status === 0 ? "erreur réseau" : `HTTP ${result.status}`}
            </span>{" "}
            <span className="text-ink-400 font-normal">({result.durationMs} ms)</span>
          </p>
          <pre className="bg-ink-900 text-ink-50 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{result.body}</pre>
        </div>
      )}
    </div>
  );
}
