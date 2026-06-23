"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ShoppingCart, Plus, Minus, X, MessageCircle, Loader2, CheckCircle2, Package, ArrowLeft } from "lucide-react";
import { formatXOF } from "@/lib/utils";
import type { Shop, ShopProduct } from "@/types";

interface CartItem {
  product: ShopProduct;
  quantity: number;
}

export default function PublicShopPage() {
  const { slug } = useParams<{ slug: string }>();

  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`/api/shop/public?slug=${slug}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Boutique introuvable");
        setShop(data.shop);
        setProducts(data.products ?? []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);

  const addToCart = useCallback((product: ShopProduct) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) return prev.map((c) => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }, []);

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart((prev) => prev
      .map((c) => c.product.id === productId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c)
      .filter((c) => c.quantity > 0)
    );
  }, []);

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!shop || cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopSlug: slug,
          items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
          customerName,
          customerPhone,
          customerEmail: customerEmail || null,
          customerAddress: customerAddress || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la commande");
      setCheckoutUrl(data.checkoutUrl);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const primaryColor = shop?.primaryColor ?? "#0C447C";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-700" />
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-4">
        <Package size={40} className="text-ink-300" />
        <p className="text-lg font-medium text-ink-900">{error ?? "Boutique introuvable"}</p>
        <p className="text-sm text-ink-500">Vérifiez le lien ou contactez le vendeur.</p>
      </div>
    );
  }

  // Confirmation de paiement
  if (checkoutUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-5" style={{ background: `${primaryColor}10` }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${primaryColor}20` }}>
          <CheckCircle2 size={32} style={{ color: primaryColor }} />
        </div>
        <div>
          <p className="text-lg font-medium text-ink-900">Commande enregistrée !</p>
          <p className="text-sm text-ink-500 mt-1.5">Cliquez ci-dessous pour payer votre commande de <strong>{formatXOF(totalAmount)}</strong>.</p>
        </div>
        <a
          href={checkoutUrl}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-white font-medium text-sm"
          style={{ background: primaryColor }}
        >
          Payer maintenant →
        </a>
        {shop.whatsappNumber && (
          <a
            href={`https://wa.me/${shop.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, je viens de passer une commande de ${formatXOF(totalAmount)} sur votre boutique ${shop.name}.`)}`}
            target="_blank" rel="noopener noreferrer"
            className="text-sm text-success-700 hover:text-success-900 flex items-center gap-1.5"
          >
            <MessageCircle size={14} /> Contacter le vendeur sur WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header boutique */}
      <div className="relative h-36 sm:h-48" style={{ background: shop.coverBase64 ? undefined : `${primaryColor}20` }}>
        {shop.coverBase64 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.coverBase64} alt="Couverture" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-end gap-4 -mt-10 relative z-10">
          <div
            className="w-20 h-20 rounded-2xl border-4 border-white shadow-card flex items-center justify-center overflow-hidden bg-white shrink-0"
          >
            {shop.logoBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoBase64} alt={shop.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                {shop.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="pb-2">
            <h1 className="text-xl font-medium text-ink-900">{shop.name}</h1>
            {shop.description && <p className="text-sm text-ink-500 mt-0.5 leading-snug">{shop.description}</p>}
          </div>
        </div>

        {shop.whatsappNumber && (
          <div className="mt-4">
            <a
              href={`https://wa.me/${shop.whatsappNumber.replace(/\D/g, "")}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-success-700 hover:text-success-900"
            >
              <MessageCircle size={14} /> Contacter sur WhatsApp
            </a>
          </div>
        )}

        {/* Produits */}
        <div className="mt-8">
          <h2 className="text-sm font-medium text-ink-500 mb-4">Nos produits ({products.length})</h2>
          {products.length === 0 ? (
            <div className="text-center py-16">
              <Package size={40} className="text-ink-200 mx-auto mb-3" />
              <p className="text-sm text-ink-400">Aucun produit disponible pour le moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {products.map((p) => {
                const inCart = cart.find((c) => c.product.id === p.id);
                const outOfStock = p.stock !== null && p.stock === 0;
                return (
                  <div key={p.id} className="rounded-xl border border-ink-100 overflow-hidden bg-white">
                    {/* Image cliquable → page détail */}
                    <a href={`/shop/${slug}/product/${p.id}`} className="block aspect-square bg-ink-50 overflow-hidden">
                      {p.imageBase64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageBase64} alt={p.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={28} className="text-ink-200" />
                        </div>
                      )}
                    </a>
                    <div className="p-3">
                      {/* Nom cliquable → page détail */}
                      <a href={`/shop/${slug}/product/${p.id}`} className="block">
                        <p className="text-sm font-medium text-ink-900 line-clamp-2 leading-snug hover:underline">{p.name}</p>
                      </a>
                      <p className="text-sm font-medium mt-1 tabular-nums" style={{ color: primaryColor }}>{formatXOF(p.price)}</p>
                      {p.stock !== null && p.stock <= 5 && p.stock > 0 && (
                        <p className="text-[11px] text-warning-700 mt-0.5">Plus que {p.stock} en stock</p>
                      )}
                      {outOfStock ? (
                        <p className="text-xs text-ink-400 mt-2">Rupture de stock</p>
                      ) : inCart ? (
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => updateQty(p.id, -1)} className="w-6 h-6 rounded-full border border-ink-200 flex items-center justify-center hover:bg-ink-50">
                            <Minus size={11} />
                          </button>
                          <span className="text-sm font-medium tabular-nums">{inCart.quantity}</span>
                          <button onClick={() => updateQty(p.id, 1)} className="w-6 h-6 rounded-full border border-ink-200 flex items-center justify-center hover:bg-ink-50">
                            <Plus size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(p)}
                          className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                          style={{ background: primaryColor }}
                        >
                          + Ajouter
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 border-t border-ink-100 bg-ink-50">
          <div className="max-w-2xl mx-auto px-4 py-8 text-center">
            <p className="text-xs text-ink-400 leading-relaxed">
              Verzapay n&apos;est pas une banque et ne fournit pas elle-même de services de monnaie électronique.
              Les opérations d&apos;encaissement et de décaissement sont exécutées par l&apos;intermédiaire
              de solutions de paiement agréées, intégrées à notre plateforme.
            </p>
            <p className="text-xs text-ink-300 mt-3">© {new Date().getFullYear()} Verzapay</p>
          </div>
        </footer>
      </div>

      {/* Barre panier fixe */}
      {totalItems > 0 && !checkoutOpen && (
        <div className="fixed bottom-0 inset-x-0 p-4 z-30">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full flex items-center justify-between rounded-xl px-5 py-3.5 text-white shadow-popover"
              style={{ background: primaryColor }}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <ShoppingCart size={18} /> {totalItems} article(s)
              </span>
              <span className="text-sm font-medium tabular-nums">{formatXOF(totalAmount)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tiroir panier */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white rounded-t-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-popover">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
              <p className="font-medium text-ink-900">Mon panier</p>
              <button onClick={() => setCartOpen(false)} className="text-ink-400"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-ink-50">
              {cart.map((c) => (
                <div key={c.product.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-12 h-12 rounded-lg bg-ink-50 overflow-hidden shrink-0">
                    {c.product.imageBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.product.imageBase64} alt={c.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={18} className="text-ink-300 m-auto mt-3" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{c.product.name}</p>
                    <p className="text-sm tabular-nums" style={{ color: primaryColor }}>{formatXOF(c.product.price)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => updateQty(c.product.id, -1)} className="w-6 h-6 rounded-full border border-ink-200 flex items-center justify-center">
                      <Minus size={10} />
                    </button>
                    <span className="text-sm font-medium tabular-nums w-4 text-center">{c.quantity}</span>
                    <button onClick={() => updateQty(c.product.id, 1)} className="w-6 h-6 rounded-full border border-ink-200 flex items-center justify-center">
                      <Plus size={10} />
                    </button>
                    <button onClick={() => removeFromCart(c.product.id)} className="text-ink-300 hover:text-danger-600 ml-1">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-ink-100">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-ink-600">Total</p>
                <p className="font-medium tabular-nums text-ink-900">{formatXOF(totalAmount)}</p>
              </div>
              <button
                onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                className="w-full rounded-xl py-3.5 text-white font-medium"
                style={{ background: primaryColor }}
              >
                Commander →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page de checkout en plein écran */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-6">
            <button onClick={() => setCheckoutOpen(false)} className="flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 mb-6">
              <ArrowLeft size={16} /> Retour au panier
            </button>

            <h2 className="text-xl font-medium text-ink-900 mb-6">Finaliser la commande</h2>

            {/* Récapitulatif */}
            <div className="rounded-xl border border-ink-200 divide-y divide-ink-50 mb-6">
              {cart.map((c) => (
                <div key={c.product.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {c.product.imageBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.product.imageBase64} alt={c.product.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-ink-100 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">{c.product.name}</p>
                      <p className="text-xs text-ink-500">{c.quantity} × {formatXOF(c.product.price)}</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium tabular-nums shrink-0">{formatXOF(c.product.price * c.quantity)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-medium text-ink-900">Total</p>
                <p className="font-medium tabular-nums" style={{ color: primaryColor }}>{formatXOF(totalAmount)}</p>
              </div>
            </div>

            <form onSubmit={handleCheckout} className="space-y-4">
              <div>
                <label className="label-base">Votre nom complet *</label>
                <input type="text" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Kofi Mensah" className="input-base" />
              </div>
              <div>
                <label className="label-base">Téléphone Mobile Money * <span className="text-ink-400 font-normal">(pour le paiement)</span></label>
                <input type="tel" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+229 96 00 00 00" className="input-base" />
              </div>
              <div>
                <label className="label-base">Email <span className="text-ink-400 font-normal">(optionnel, pour le reçu)</span></label>
                <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="vous@exemple.com" className="input-base" />
              </div>
              <div>
                <label className="label-base">Adresse de livraison <span className="text-ink-400 font-normal">(optionnel)</span></label>
                <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Quartier, ville…" className="input-base" />
              </div>

              <p className="text-xs text-ink-400 bg-ink-50 rounded-lg p-3">
                En validant, vous serez redirigé vers une page de paiement sécurisé. Une commission de 1,5% est incluse dans le montant total.
              </p>

              <button
                type="submit" disabled={submitting}
                className="w-full rounded-xl py-4 text-white font-medium flex items-center justify-center gap-2 text-base"
                style={{ background: primaryColor }}
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
                Payer {formatXOF(totalAmount)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}