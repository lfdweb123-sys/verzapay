"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/components/ui/toast";
import { ImageUploadField } from "@/components/payments/image-upload-field";
import { Spinner } from "@/components/ui/badges";
import type { Shop } from "@/types";

const COLOR_PRESETS = ["#0C447C", "#3B6D11", "#854F0B", "#993556", "#534AB7", "#993C1D"];

export default function ShopSettingsPage() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { show } = useToast();
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0C447C");
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [coverBase64, setCoverBase64] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !activeCompany) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/shop/mine?uid=${user.uid}&companyId=${activeCompany.id}`);
        const data = await res.json();
        if (!data.shop) { router.replace("/shop"); return; }
        const s: Shop = data.shop;
        setShop(s);
        setName(s.name);
        setDescription(s.description ?? "");
        setWhatsapp(s.whatsappNumber ?? "");
        setPrimaryColor(s.primaryColor ?? "#0C447C");
        setLogoBase64(s.logoBase64 ?? null);
        setCoverBase64(s.coverBase64 ?? null);
        setIsActive(s.isActive);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, activeCompany?.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !shop) return;
    setSaving(true);
    try {
      const res = await fetch("/api/shop/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          shopId: shop.id,
          name,
          description,
          whatsappNumber: whatsapp,
          primaryColor,
          logoBase64,
          coverBase64,
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la sauvegarde");
      show("Boutique mise à jour", "success");
      router.push("/shop");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size={24} /></div>;
  if (!shop) return null;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/shop" className="btn-ghost -ml-1"><ArrowLeft size={16} /></Link>
        <h1 className="text-lg font-medium text-ink-900">Paramètres de la boutique</h1>
      </div>

      <form onSubmit={handleSave} className="card-base p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <ImageUploadField value={logoBase64} onChange={setLogoBase64} />
          <ImageUploadField value={coverBase64} onChange={setCoverBase64} />
        </div>

        <div>
          <label className="label-base">Nom de la boutique *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="input-base" />
        </div>

        <div>
          <label className="label-base">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-base h-auto py-2 resize-none" />
        </div>

        <div>
          <label className="label-base">Numéro WhatsApp</label>
          <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+229 96 00 00 00" className="input-base" />
        </div>

        <div>
          <label className="label-base">Couleur de la boutique</label>
          <div className="flex items-center gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c} type="button" onClick={() => setPrimaryColor(c)}
                className="w-8 h-8 rounded-full border-2 transition-transform"
                style={{ background: c, borderColor: primaryColor === c ? "#1A1A19" : "transparent", transform: primaryColor === c ? "scale(1.1)" : "scale(1)" }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between bg-ink-50 rounded-lg p-3">
          <div>
            <p className="text-sm text-ink-700">Boutique ouverte</p>
            <p className="text-xs text-ink-500">Désactivez pour fermer temporairement votre boutique aux visiteurs.</p>
          </div>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded shrink-0" />
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Enregistrer
        </button>
      </form>
    </div>
  );
}
