"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { Spinner, EmptyState } from "@/components/ui/badges";
import {
  Store, Plus, Loader2, Copy, ExternalLink, CheckCircle2,
  Package, ShoppingBag, Settings, ArrowRight,
} from "lucide-react";
import { formatXOF, slugify } from "@/lib/utils";
import type { Shop, ShopProduct, ShopOrder } from "@/types";

export default function ShopHomePage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();

  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user || !activeCompany) { setLoading(false); return; }
    loadShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeCompany?.id]);

  async function loadShop() {
    if (!user || !activeCompany) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/shop/mine?uid=${user.uid}&companyId=${activeCompany.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de chargement");
      setShop(data.shop);
      setProducts(data.products ?? []);
      setOrders(data.orders ?? []);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeCompany) return;
    setCreating(true);
    try {
      const res = await fetch("/api/shop/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, companyId: activeCompany.id, name, slug, description, whatsappNumber: whatsapp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la création");
      show("Boutique créée avec succès", "success");
      await loadShop();
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setCreating(false);
    }
  }

  function copyShopLink() {
    if (!shop) return;
    const url = `${window.location.origin}/shop/${shop.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    show("Lien copié !", "success");
  }

  if (loading) return <div className="flex justify-center items-center min-h-[40vh]"><Spinner size={28} /></div>;

  if (!activeCompany) {
    return (
      <div className="card-base p-8 text-center">
        <p className="text-sm text-ink-500">Créez ou sélectionnez une entreprise pour créer votre boutique.</p>
      </div>
    );
  }

  const canCreateShop = activeCompany.kycStatus === "approved" && activeCompany.apiKeySecretGenerated;

  if (!shop) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto">
            <Store size={26} className="text-brand-700" />
          </div>
          <h1 className="text-lg font-medium text-ink-900 mt-4">Créer ma boutique</h1>
          <p className="text-sm text-ink-500 mt-1.5">
            Une boutique en ligne simple, liée à <strong>{activeCompany.name}</strong>, que vous pourrez partager à vos clients en un lien.
          </p>
        </div>

        {!canCreateShop ? (
          <div className="card-base p-6 text-center space-y-3">
            <p className="text-sm text-ink-600">
              Pour créer votre boutique, votre entreprise doit être vérifiée (KYC approuvé) et disposer d&apos;une clé API active.
            </p>
            <div className="flex flex-col gap-2">
              {activeCompany.kycStatus !== "approved" && (
                <Link href={`/kyc-pending?companyId=${activeCompany.id}`} className="btn-primary mx-auto">Vérifier mon entreprise</Link>
              )}
              {activeCompany.kycStatus === "approved" && !activeCompany.apiKeySecretGenerated && (
                <Link href="/developers" className="btn-primary mx-auto">Générer ma clé API</Link>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="card-base p-5 space-y-4">
            <div>
              <label className="label-base">Nom de la boutique *</label>
              <input type="text" required value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Boutique Kofi" className="input-base" />
            </div>
            <div>
              <label className="label-base">Lien de votre boutique *</label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-ink-400 whitespace-nowrap">verzapay.app/shop/</span>
                <input
                  type="text" required value={slug}
                  onChange={(e) => { setSlug(slugify(e.target.value)); setSlugEdited(true); }}
                  placeholder="boutique-kofi" className="input-base"
                />
              </div>
              <p className="text-xs text-ink-400 mt-1.5">Lettres minuscules, chiffres et tirets uniquement.</p>
            </div>
            <div>
              <label className="label-base">Description (optionnel)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Quelques mots sur votre boutique" className="input-base h-auto py-2 resize-none" />
            </div>
            <div>
              <label className="label-base">Numéro WhatsApp (optionnel)</label>
              <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+229 96 00 00 00" className="input-base" />
            </div>
            <button type="submit" disabled={creating} className="btn-primary w-full">
              {creating && <Loader2 size={16} className="animate-spin" />}
              Créer ma boutique
            </button>
          </form>
        )}
      </div>
    );
  }

  const shopBase = process.env.NEXT_PUBLIC_SHOP_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const shopUrl = `${shopBase}/shop/${shop.slug}`;
  const totalSales = orders.filter((o) => o.status === "paid" || o.status === "fulfilled").reduce((s, o) => s + o.totalAmount, 0);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink-900 flex items-center gap-2">
            {shop.name}
            {!shop.isActive && <span className="badge bg-ink-100 text-ink-600">Fermée</span>}
          </h1>
          <p className="text-sm text-ink-500">{activeCompany.name}</p>
        </div>
        <Link href="/shop/settings" className="btn-secondary text-sm">
          <Settings size={15} /> Paramètres
        </Link>
      </div>

      <div className="card-base p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-500">Lien de votre boutique</p>
          <p className="text-sm font-medium text-brand-700 truncate">{shopUrl}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copyShopLink} className="btn-secondary text-sm">
            {copied ? <CheckCircle2 size={15} className="text-success-700" /> : <Copy size={15} />}
            {copied ? "Copié" : "Copier"}
          </button>
          <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
            <ExternalLink size={15} /> Voir
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><Package size={12} /> Produits</p>
          <p className="text-xl font-medium mt-1 tabular-nums">{products.length}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500 flex items-center gap-1"><ShoppingBag size={12} /> Commandes en attente</p>
          <p className="text-xl font-medium mt-1 tabular-nums text-warning-700">{pendingOrders}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-ink-500">Ventes encaissées</p>
          <p className="text-xl font-medium mt-1 tabular-nums text-success-700">{formatXOF(totalSales)}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/shop/products/new" className="card-base p-4 flex items-center justify-between hover:border-brand-300 transition-colors">
          <span className="text-sm font-medium text-ink-900 flex items-center gap-2"><Plus size={15} className="text-brand-700" /> Ajouter un produit</span>
          <ArrowRight size={15} className="text-ink-400" />
        </Link>
        <Link href="/shop/orders" className="card-base p-4 flex items-center justify-between hover:border-brand-300 transition-colors">
          <span className="text-sm font-medium text-ink-900 flex items-center gap-2"><ShoppingBag size={15} className="text-brand-700" /> Voir les commandes</span>
          <ArrowRight size={15} className="text-ink-400" />
        </Link>
      </div>

      <div className="card-base overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
          <p className="text-sm font-medium text-ink-900">Mes produits</p>
          <Link href="/shop/products/new" className="text-xs text-brand-600 hover:text-brand-700">Ajouter</Link>
        </div>
        {products.length === 0 ? (
          <EmptyState title="Aucun produit" description="Ajoutez votre premier produit pour commencer à vendre." icon={Package} />
        ) : (
          <div className="divide-y divide-ink-50">
            {products.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/shop/products/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-ink-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {p.imageBase64 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageBase64} alt={p.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
                      <Package size={16} className="text-ink-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{p.name}</p>
                    {!p.isActive && <span className="badge bg-ink-100 text-ink-600 mt-0.5">Masqué</span>}
                  </div>
                </div>
                <p className="text-sm font-medium tabular-nums shrink-0">{formatXOF(p.price)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
