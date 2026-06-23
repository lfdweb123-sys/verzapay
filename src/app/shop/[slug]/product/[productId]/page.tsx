"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShoppingCart, Loader2, Package, MessageCircle, Minus, Plus } from "lucide-react";
import { formatXOF } from "@/lib/utils";
import type { Shop, ShopProduct } from "@/types";

export default function PublicProductPage() {
  const { slug, productId } = useParams<{ slug: string; productId: string }>();
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`/api/shop/public?slug=${slug}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Boutique introuvable");
        setShop(data.shop);
        const found = (data.products as ShopProduct[]).find((p) => p.id === productId);
        setProduct(found ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, productId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-700" />
      </div>
    );
  }

  if (!shop || !product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-4">
        <Package size={40} className="text-ink-300" />
        <p className="text-lg font-medium text-ink-900">Produit introuvable</p>
        <button onClick={() => router.back()} className="text-sm text-brand-600 hover:underline">← Retour à la boutique</button>
      </div>
    );
  }

  const primaryColor = shop.primaryColor ?? "#0C447C";
  const outOfStock = product.stock !== null && product.stock === 0;

  // Encode le panier dans l'URL pour le retrouver sur la page principale
  function handleAddToCart() {
    const params = new URLSearchParams({ add: product!.id, qty: String(qty) });
    router.push(`/shop/${slug}?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header retour */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-ink-100 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900">
            <ArrowLeft size={16} /> {shop.name}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* Image produit */}
        <div className="rounded-2xl overflow-hidden bg-ink-50 aspect-square max-h-72 flex items-center justify-center">
          {product.imageBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageBase64} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package size={56} className="text-ink-200" />
          )}
        </div>

        {/* Infos produit */}
        <div className="mt-6">
          <h1 className="text-2xl font-medium text-ink-900">{product.name}</h1>
          <p className="text-2xl font-medium mt-1 tabular-nums" style={{ color: primaryColor }}>
            {formatXOF(product.price)}
          </p>

          {product.description && (
            <p className="text-sm text-ink-600 mt-4 leading-relaxed">{product.description}</p>
          )}

          {product.stock !== null && product.stock > 0 && product.stock <= 10 && (
            <p className="text-sm text-warning-700 mt-3">Plus que {product.stock} en stock</p>
          )}
          {outOfStock && (
            <p className="text-sm text-danger-700 mt-3 font-medium">Rupture de stock</p>
          )}
        </div>

        {/* Sélecteur quantité */}
        {!outOfStock && (
          <div className="mt-6 flex items-center gap-4">
            <p className="text-sm text-ink-600">Quantité</p>
            <div className="flex items-center gap-3 border border-ink-200 rounded-xl px-4 py-2">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="text-ink-600 hover:text-ink-900"
              >
                <Minus size={16} />
              </button>
              <span className="text-sm font-medium tabular-nums w-6 text-center">{qty}</span>
              <button
                onClick={() => setQty(Math.min(product.stock ?? 999, qty + 1))}
                className="text-ink-600 hover:text-ink-900"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Bouton commander */}
        {!outOfStock && (
          <button
            onClick={handleAddToCart}
            className="mt-6 w-full rounded-xl py-4 text-white font-medium flex items-center justify-center gap-2 text-base"
            style={{ background: primaryColor }}
          >
            <ShoppingCart size={20} />
            Ajouter au panier — {formatXOF(product.price * qty)}
          </button>
        )}

        {/* WhatsApp */}
        {shop.whatsappNumber && (
          
            href={`https://wa.me/${shop.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, je suis intéressé(e) par "${product.name}" à ${formatXOF(product.price)} sur votre boutique ${shop.name}.`)}`}
            target="_blank" rel="noopener noreferrer"
            className="mt-4 w-full rounded-xl py-3.5 border border-success-300 text-success-700 font-medium flex items-center justify-center gap-2 hover:bg-success-50 transition-colors"
          >
            <MessageCircle size={18} /> Demander via WhatsApp
          </a>
        )}
      </div>

      {/* Footer boutique */}
      <div className="max-w-2xl mx-auto px-4 mt-16 pt-6 border-t border-ink-100">
        <p className="text-xs text-ink-400 text-center leading-relaxed">
          Verzapay n&apos;est pas une banque et ne fournit pas elle-même de services de monnaie électronique.
          Les opérations sont exécutées par l&apos;intermédiaire de solutions de paiement agréées.
        </p>
      </div>
    </div>
  );
}