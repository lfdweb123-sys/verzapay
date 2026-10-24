"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getNavId } from "@/lib/nav-state";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ImageUploadField } from "@/components/payments/image-upload-field";
import { Spinner } from "@/components/ui/badges";
import type { ShopProduct } from "@/types";

export default function EditProductPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const stored = getNavId("product");
    if (!stored) router.replace("/shop");
    else setId(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const res = await fetch(`/api/shop/products/get?uid=${user.uid}&productId=${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        const p: ShopProduct = data.product;
        setProduct(p);
        setName(p.name);
        setDescription(p.description ?? "");
        setPrice(String(p.price));
        setTrackStock(p.stock !== null);
        setStock(p.stock !== null ? String(p.stock) : "");
        setIsActive(p.isActive);
        setImageBase64(p.imageBase64 ?? null);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !product) return;
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum <= 0) { show("Renseignez un prix valide", "error"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/shop/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          productId: product.id,
          name,
          description,
          price: priceNum,
          imageBase64,
          stock: trackStock ? (parseInt(stock, 10) || 0) : null,
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la sauvegarde");
      show("Produit mis à jour", "success");
      router.push("/shop");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user || !product) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/shop/products/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, productId: product.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la suppression");
      show("Produit supprimé", "success");
      router.push("/shop");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size={24} /></div>;
  if (!product) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/shop" className="btn-ghost -ml-1"><ArrowLeft size={16} /></Link>
          <h1 className="text-lg font-medium text-ink-900">Modifier le produit</h1>
        </div>
        <button onClick={() => setConfirmDelete(true)} className="text-danger-600 hover:text-danger-700">
          <Trash2 size={17} />
        </button>
      </div>

      <form onSubmit={handleSave} className="card-base p-5 space-y-4">
        <ImageUploadField value={imageBase64} onChange={setImageBase64} />

        <div>
          <label className="label-base">Nom du produit *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="input-base" />
        </div>

        <div>
          <label className="label-base">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-base h-auto py-2 resize-none" />
        </div>

        <div>
          <label className="label-base">Prix (XOF) *</label>
          <input type="number" min="1" required value={price} onChange={(e) => setPrice(e.target.value)} className="input-base" />
        </div>

        <div className="flex items-center justify-between bg-ink-50 rounded-lg p-3">
          <label htmlFor="trackStock" className="text-sm text-ink-700">Suivre le stock disponible</label>
          <input id="trackStock" type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="rounded" />
        </div>

        {trackStock && (
          <div>
            <label className="label-base">Quantité en stock</label>
            <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className="input-base" />
          </div>
        )}

        <div className="flex items-center justify-between bg-ink-50 rounded-lg p-3">
          <label htmlFor="isActive" className="text-sm text-ink-700">Produit visible dans la boutique</label>
          <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Enregistrer
        </button>
      </form>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-popover p-6 text-center">
            <p className="font-medium text-ink-900">Supprimer ce produit ?</p>
            <p className="text-sm text-ink-500 mt-2">Cette action est irréversible.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1">Annuler</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
