"use client";

import { X } from "lucide-react";

/** Fenêtre modale réutilisable : en-tête et pied toujours visibles, contenu défilant (compatible mobile). */
export function SimpleModal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-ink-900/40 backdrop-blur-sm">
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92dvh] flex flex-col shadow-popover animate-slide-up`}>
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <p className="font-medium text-ink-900">{title}</p>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-ink-400 hover:text-ink-700"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-ink-100 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: "green" | "amber" | "red" | "gray" | "blue"; children: React.ReactNode }) {
  const styles = {
    green: "bg-success-50 text-success-700", amber: "bg-warning-50 text-warning-900",
    red: "bg-danger-50 text-danger-700", gray: "bg-ink-100 text-ink-600", blue: "bg-brand-50 text-brand-800",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}
