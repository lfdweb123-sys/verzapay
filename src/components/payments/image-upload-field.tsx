"use client";

import { useRef, useState } from "react";
import { ImagePlus, X, AlertTriangle } from "lucide-react";

const MAX_SIZE_BYTES = 500 * 1024; // 500 Ko
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploadFieldProps {
  value: string | null;
  onChange: (base64: string | null) => void;
}

export function ImageUploadField({ value, onChange }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Format non supporté. Utilisez JPG, PNG ou WebP.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setError(`Image trop volumineuse (${(file.size / 1024).toFixed(0)} Ko). Taille maximum : 500 Ko.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.onerror = () => {
      setError("Erreur lors de la lecture du fichier.");
    };
    reader.readAsDataURL(file);
  }

  function handleRemove() {
    onChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <label className="label-base">Photo du produit ou service (optionnel)</label>

      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Aperçu" className="w-28 h-28 rounded-lg object-cover border border-ink-200" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger-500 text-white flex items-center justify-center shadow-card hover:bg-danger-700"
            aria-label="Retirer l'image"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-28 h-28 rounded-lg border-2 border-dashed border-ink-200 flex flex-col items-center justify-center gap-1.5 text-ink-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          <ImagePlus size={20} />
          <span className="text-[11px]">Ajouter</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="hidden"
      />

      <p className="text-xs text-ink-400 mt-1.5">JPG, PNG ou WebP — 500 Ko maximum</p>

      {error && (
        <p className="text-xs text-danger-700 mt-1.5 flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
    </div>
  );
}
