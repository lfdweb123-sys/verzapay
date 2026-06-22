"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { ImageUploadField } from "@/components/payments/image-upload-field";
import type { Shop } from "@/types";

export default function NewProductPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !activeCompany) { setLoadingShop(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/shop/mine?uid=${user.uid}&companyId=${activeCompany.id}`);
        const data = await res.json();
        setShop(data.shop ?? null);
      } finally {
        setLoadingShop(false);
      }
    })();
  }, [user, activeCompany?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !shop) return;
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum <= 0) { show("Renseignez un prix valide", "error"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/shop/products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          shopId: shop.id,
          name,
          description,
          price: priceNum,
          imageBase64,
          stock: trackStock ? (parseInt(stock, 10) || 0) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la création");
      show("Produit ajouté", "success");
      router.push("/shop");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadingShop) return null;

  if (!shop) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Link href="/shop" className="btn-ghost -ml-1"><ArrowLeft size={16} /> Retour</Link>
        <div className="card-base p-8 text-center">
          <p className="text-sm text-ink-500">Créez d&apos;abord votre boutique avant d&apos;ajouter des produits.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/shop" className="btn-ghost -ml-1"><ArrowLeft size={16} /></Link>
        <h1 className="text-lg font-medium text-ink-900">Ajouter un produit</h1>
      </div>

      <form onSubmit={handleSubmit} className="card-base p-5 space-y-4">
        <ImageUploadField value={imageBase64} onChange={setImageBase64} />

        <div>
          <label className="label-base">Nom du produit *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Robe wax taille M" className="input-base" />
        </div>

        <div>
          <label className="label-base">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Décrivez votre produit…" className="input-base h-auto py-2 resize-none" />
        </div>

        <div>
          <label className="label-base">Prix (XOF) *</label>
          <input type="number" min="1" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15 000" className="input-base" />
        </div>

        <div className="flex items-center justify-between bg-ink-50 rounded-lg p-3">
          <label htmlFor="trackStock" className="text-sm text-ink-700">Suivre le stock disponible</label>
          <input id="trackStock" type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="rounded" />
        </div>

        {trackStock && (
          <div>
            <label className="label-base">Quantité en stock</label>
            <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="10" className="input-base" />
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Ajouter le produit
        </button>
      </form>
    </div>
  );
}
