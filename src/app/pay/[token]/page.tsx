"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Lock, ShieldCheck, Smartphone, CreditCard, Landmark, ArrowRight, Loader2,
  CheckCircle2, XCircle, Clock, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNetworkBrand, OFFICIAL_LOGOS } from "@/lib/network-brands";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

interface CheckoutData {
  businessName: string;
  reference: string;
  description: string;
  currency: string;
  subtotal: number;
  fee: number;
  total: number;
  country: { code: string; name: string; indicator: string } | null;
  methods: { mobileMoney: { code: string; name: string }[]; card: boolean; bank: boolean };
  customerPhone: string;
  alreadyPaid: boolean;
  expired: boolean;
}

type Method = "MOBILE_MONEY" | "CARD" | "BANK_TRANSFER";
type View = "form" | "pending" | "success" | "failed" | "cancelled" | "expired";

const POLL_MS = 3000;
const POLL_MAX_MS = 5 * 60 * 1000;

const fmt = (n: number, cur: string) =>
  `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${cur === "XOF" || cur === "XAF" ? "FCFA" : cur}`;

function flag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

export default function CheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const returned = search.get("r"); // retour du partenaire : simple indication, JAMAIS une preuve

  const [data, setData] = useState<CheckoutData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("MOBILE_MONEY");
  const [operator, setOperator] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("form");
  const [message, setMessage] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/checkout/${token}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Lien invalide");
        return d as CheckoutData;
      })
      .then((d) => {
        setData(d);
        setPhone(d.customerPhone.replace(d.country?.indicator ?? "", ""));
        if (d.methods.mobileMoney.length > 0) setMethod("MOBILE_MONEY");
        if (d.methods.mobileMoney.length === 1) setOperator(d.methods.mobileMoney[0].code);
        else if (d.methods.card) setMethod("CARD");
        else if (d.methods.bank) setMethod("BANK_TRANSFER");
        if (d.alreadyPaid) setView("success");
        else if (d.expired) setView("expired");
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [token]);

  async function checkStatus(startedAt: number) {
    try {
      const res = await fetch(`/api/checkout/${token}/status`, { cache: "no-store" });
      const s = await res.json();
      if (!res.ok) throw new Error();
      if (s.state === "success") { setView("success"); return; }
      if (s.state === "failed") { setView("failed"); setMessage(s.message ?? null); setCanRetry(!!s.canRetry); return; }
      if (s.state === "cancelled") { setView("cancelled"); setMessage(s.message ?? null); return; }
      if (s.state === "expired") { setView("expired"); return; }
    } catch { /* on réessaie au prochain cycle */ }
    if (Date.now() - startedAt > POLL_MAX_MS) {
      setView("failed");
      setMessage("Nous n'avons pas reçu de confirmation. Si vous avez été débité, contactez le vendeur avec la référence indiquée.");
      setCanRetry(false);
      return;
    }
    timer.current = setTimeout(() => checkStatus(startedAt), POLL_MS);
  }

  function startPolling() {
    setView("pending");
    checkStatus(Date.now());
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Retour depuis la page carte/virement : on VÉRIFIE côté serveur, on ne se fie pas au paramètre
  useEffect(() => {
    if (returned && data && view === "form" && !data.alreadyPaid && !data.expired) {
      if (returned === "cancel") { setMessage("Paiement annulé. Vous pouvez réessayer."); }
      else startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, data]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!data || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/checkout/${token}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          operatorCode: method === "MOBILE_MONEY" ? operator : undefined,
          phone: method === "MOBILE_MONEY" ? phone : undefined,
          otp: needsOtp && otp ? otp : undefined,
        }),
      });
      const out = await res.json();
      if (!res.ok) {
        if (out.needsOtp) setNeedsOtp(true);
        throw new Error(out.error ?? "Paiement impossible");
      }
      if (out.redirectUrl) {
        window.location.href = out.redirectUrl; // carte / virement : page de paiement sécurisée
        return;
      }
      startPolling();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const hasAnyMethod = !!data && (data.methods.mobileMoney.length > 0 || data.methods.card || data.methods.bank);

  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-50/60 via-white to-brand-50/40 px-3 sm:px-6 py-4 sm:py-8">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-ink-100 overflow-hidden">
        {/* En-tête */}
        <header className="flex items-center justify-between gap-4 px-5 sm:px-8 py-4 border-b border-ink-100">
          <div className="flex items-center gap-4 min-w-0">
            <Image src="/icons/verzapay.png" alt="Verzapay" width={160} height={42} priority className="h-9 w-auto" />
            <span className="hidden md:block text-xs text-ink-500 border-l border-ink-100 pl-4">Paiements simples, rapides et sécurisés</span>
          </div>
          <div className="flex items-center gap-3 text-right">
            <LanguageSwitcher />
            <Lock size={20} className="text-brand-700 shrink-0" />
            <div className="leading-tight">
              <p className="text-xs font-medium text-ink-900">Paiement sécurisé</p>
              <p className="text-[11px] text-ink-500 hidden sm:block">Vos informations sont protégées</p>
            </div>
          </div>
        </header>

        {loadError ? (
          <div className="p-10 text-center space-y-3">
            <AlertTriangle size={34} className="mx-auto text-warning-700" />
            <p className="font-medium text-ink-900">Ce lien de paiement n&apos;est pas valide</p>
            <p className="text-sm text-ink-500">{loadError}. Vérifiez le lien ou contactez le vendeur.</p>
          </div>
        ) : !data ? (
          <div className="flex justify-center py-24 text-ink-400"><Loader2 className="animate-spin" size={26} /></div>
        ) : (
          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 p-4 sm:p-7">
            {/* Colonne principale */}
            <section className="rounded-xl border border-ink-100 p-5 sm:p-7">
              {view === "success" && (
                <ResultPanel icon={<CheckCircle2 size={40} className="text-success-700" />} tone="success" title="Paiement confirmé" text={`Merci ! Votre paiement de ${fmt(data.total, data.currency)} à ${data.businessName} a bien été reçu.`} reference={data.reference} />
              )}
              {view === "failed" && (
                <ResultPanel icon={<XCircle size={40} className="text-danger-700" />} tone="danger" title="Paiement non abouti" text={message ?? "Le paiement a échoué."} reference={data.reference}
                  action={canRetry ? <button className="btn-primary mt-4" onClick={() => { setView("form"); setError(null); }}>Réessayer</button> : undefined} />
              )}
              {view === "cancelled" && (
                <ResultPanel icon={<XCircle size={40} className="text-ink-400" />} tone="neutral" title="Paiement annulé" text={message ?? "Ce paiement a été annulé."} reference={data.reference} />
              )}
              {view === "expired" && (
                <ResultPanel icon={<Clock size={40} className="text-warning-700" />} tone="neutral" title="Lien expiré" text="Ce lien de paiement n'est plus valide. Demandez-en un nouveau au vendeur." reference={data.reference} />
              )}
              {view === "pending" && (
                <div className="text-center py-8 space-y-4">
                  <Loader2 size={40} className="mx-auto animate-spin text-brand-700" />
                  <p className="font-medium text-ink-900">En attente de confirmation…</p>
                  <p className="text-sm text-ink-500 max-w-sm mx-auto">
                    {method === "MOBILE_MONEY"
                      ? "Validez le paiement sur votre téléphone (message ou code secret demandé par votre opérateur). Cette page se met à jour automatiquement."
                      : "Vérification de votre paiement en cours…"}
                  </p>
                  <p className="text-xs text-ink-400">Ne fermez pas cette page et ne payez pas deux fois.</p>
                </div>
              )}

              {view === "form" && (
                <form onSubmit={handlePay} className="space-y-7">
                  {message && <p className="text-sm text-warning-900 bg-warning-50 rounded-lg px-3 py-2">{message}</p>}

                  {/* 1. Pays */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-medium">1</span>
                      <h2 className="font-medium text-ink-900">Informations de paiement</h2>
                    </div>
                    <label className="label-base">Pays</label>
                    <div className="input-base flex items-center gap-3 bg-ink-50/60 text-ink-800">
                      <span className="text-xl leading-none">{data.country ? flag(data.country.code) : "🌍"}</span>
                      <span>{data.country?.name ?? "—"}</span>
                    </div>
                  </div>

                  {/* 2. Moyen de paiement */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-medium">2</span>
                      <h2 className="font-medium text-ink-900">Choisissez votre moyen de paiement</h2>
                    </div>

                    {!hasAnyMethod && <p className="text-sm text-danger-700">Aucun moyen de paiement n&apos;est disponible pour le moment.</p>}

                    <div className="space-y-3">
                      {data.methods.mobileMoney.length > 0 && (
                        <MethodCard
                          selected={method === "MOBILE_MONEY"} onSelect={() => setMethod("MOBILE_MONEY")}
                          icon={<Smartphone size={24} />} title="Mobile Money" subtitle="Payez avec votre compte mobile money"
                        >
                          {method === "MOBILE_MONEY" && (
                            <div className="mt-4 space-y-3">
                              <div>
                                <label className="label-base">Votre réseau</label>
                                <div className="flex flex-wrap gap-4 pt-1">
                                  {data.methods.mobileMoney.map((m) => {
                                    const brand = getNetworkBrand(m.code, m.name);
                                    const logo = OFFICIAL_LOGOS[brand.id];
                                    const active = operator === m.code;
                                    return (
                                      <button
                                        key={m.code} type="button" onClick={() => setOperator(m.code)} aria-pressed={active}
                                        className="group flex flex-col items-center gap-1.5 w-[84px] focus:outline-none"
                                      >
                                        <span
                                          className={cn("relative w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-[3px] shadow-sm transition-all",
                                            active ? "scale-105 ring-4 ring-brand-200" : "opacity-90 group-hover:opacity-100 group-hover:scale-105")}
                                          style={{ backgroundColor: brand.bg, borderColor: active ? "#1D4ED8" : brand.ring ?? "#FFFFFF" }}
                                        >
                                          {logo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={logo} alt={brand.label} className="w-full h-full object-cover" />
                                          ) : (
                                            <span className="font-bold tracking-tight leading-none text-center px-1" style={{ color: brand.fg, fontSize: brand.mark.length > 5 ? 11 : brand.mark.length > 3 ? 14 : 17 }}>
                                              {brand.mark}
                                            </span>
                                          )}
                                          {active && (
                                            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-brand-700 text-white flex items-center justify-center">
                                              <CheckCircle2 size={14} />
                                            </span>
                                          )}
                                        </span>
                                        <span className={cn("text-[11px] text-center leading-tight", active ? "font-medium text-brand-800" : "text-ink-600")}>{brand.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div>
                                <label className="label-base">Numéro de téléphone</label>
                                <div className="flex gap-2">
                                  <span className="input-base w-auto flex items-center bg-ink-50/60 text-ink-600 tabular-nums">{data.country?.indicator}</span>
                                  <input type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="input-base" placeholder="Numéro à débiter" autoComplete="tel-national" />
                                </div>
                              </div>
                              {needsOtp && (
                                <div>
                                  <label className="label-base">Code de confirmation (OTP)</label>
                                  <input type="text" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} className="input-base" placeholder="Code reçu de votre opérateur" />
                                </div>
                              )}
                            </div>
                          )}
                        </MethodCard>
                      )}
                      {data.methods.card && (
                        <MethodCard selected={method === "CARD"} onSelect={() => setMethod("CARD")} icon={<CreditCard size={24} />} title="Carte bancaire" subtitle="Payez avec Visa ou Mastercard">
                          {method === "CARD" && <p className="mt-3 text-xs text-ink-500">Vous serez redirigé vers une page sécurisée pour saisir votre carte, puis ramené ici.</p>}
                        </MethodCard>
                      )}
                      {data.methods.bank && (
                        <MethodCard selected={method === "BANK_TRANSFER"} onSelect={() => setMethod("BANK_TRANSFER")} icon={<Landmark size={24} />} title="Virement bancaire" subtitle="Payez par transfert bancaire">
                          {method === "BANK_TRANSFER" && <p className="mt-3 text-xs text-ink-500">Vous serez redirigé vers une page sécurisée avec les instructions de virement.</p>}
                        </MethodCard>
                      )}
                    </div>
                  </div>

                  {error && <p className="text-sm text-danger-700 bg-danger-50 rounded-lg px-3 py-2">{error}</p>}

                  <div>
                    <button
                      type="submit"
                      disabled={submitting || !hasAnyMethod || (method === "MOBILE_MONEY" && !operator)}
                      className="w-full h-13 py-3.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-medium flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
                    >
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : <Lock size={17} />}
                      Payer maintenant
                      {!submitting && <ArrowRight size={18} />}
                    </button>
                    <p className="mt-3 text-xs text-ink-500 leading-relaxed">
                      En cliquant sur « Payer maintenant », vous acceptez nos{" "}
                      <a href="/terms" target="_blank" className="text-brand-700 hover:underline">Conditions d&apos;utilisation</a> et notre{" "}
                      <a href="/privacy" target="_blank" className="text-brand-700 hover:underline">Politique de confidentialité</a>.
                    </p>
                  </div>
                </form>
              )}
            </section>

            {/* Résumé */}
            <aside className="rounded-xl border border-ink-100 p-5 sm:p-6 h-fit space-y-5">
              <h2 className="font-medium text-ink-900">Résumé de la commande</h2>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 break-words">{data.description}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{data.businessName}</p>
                  <p className="text-[11px] text-ink-400 mt-0.5 font-mono">Réf. {data.reference}</p>
                </div>
                <p className="text-sm font-medium text-ink-900 whitespace-nowrap">{fmt(data.subtotal, data.currency)}</p>
              </div>
              <div className="border-t border-ink-100 pt-4 space-y-2 text-sm">
                <div className="flex justify-between text-ink-600"><span>Sous-total</span><span className="tabular-nums">{fmt(data.subtotal, data.currency)}</span></div>
                <div className="flex justify-between text-ink-600"><span>Frais de traitement</span><span className="tabular-nums">{fmt(data.fee, data.currency)}</span></div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3.5">
                <span className="font-medium text-ink-900">Total à payer</span>
                <span className="text-lg font-medium text-brand-700 tabular-nums">{fmt(data.total, data.currency)}</span>
              </div>
              <div className="flex items-start gap-3 text-xs text-ink-500">
                <ShieldCheck size={22} className="text-brand-700 shrink-0" />
                <div>
                  <p className="font-medium text-ink-700">Paiement 100 % sécurisé</p>
                  <p>Vos données sont chiffrées et protégées.</p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function MethodCard({ selected, onSelect, icon, title, subtitle, children }: {
  selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; subtitle: string; children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      className={cn("rounded-xl border p-4 cursor-pointer transition-colors", selected ? "border-brand-600 bg-brand-50/40" : "border-ink-200 hover:bg-ink-50/50")}
    >
      <div className="flex items-center gap-4">
        <span className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ink-900">{title}</p>
          <p className="text-xs text-ink-500">{subtitle}</p>
        </div>
        <span className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", selected ? "border-brand-700" : "border-ink-300")}>
          {selected && <span className="w-2.5 h-2.5 rounded-full bg-brand-700" />}
        </span>
      </div>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function ResultPanel({ icon, tone, title, text, reference, action }: {
  icon: React.ReactNode; tone: "success" | "danger" | "neutral"; title: string; text: string; reference: string; action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-10 space-y-3">
      <div className={cn("w-16 h-16 rounded-full mx-auto flex items-center justify-center",
        tone === "success" ? "bg-success-50" : tone === "danger" ? "bg-danger-50" : "bg-ink-50")}>{icon}</div>
      <p className="text-lg font-medium text-ink-900">{title}</p>
      <p className="text-sm text-ink-500 max-w-sm mx-auto">{text}</p>
      <p className="text-xs text-ink-400 font-mono">Réf. {reference}</p>
      {action}
    </div>
  );
}
