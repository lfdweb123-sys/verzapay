export function LegalPageHeader({ title, subtitle, updatedAt }: { title: string; subtitle?: string; updatedAt?: string }) {
  return (
    <div className="mb-10 pb-8 border-b border-ink-100">
      <h1 className="text-3xl sm:text-4xl font-medium text-ink-900 tracking-tight">{title}</h1>
      {subtitle && <p className="mt-3 text-ink-600 text-base leading-relaxed">{subtitle}</p>}
      {updatedAt && <p className="mt-3 text-xs text-ink-400">Dernière mise à jour : {updatedAt}</p>}
    </div>
  );
}
