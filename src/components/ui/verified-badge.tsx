import { BadgeCheck } from "lucide-react";

/** Badge vert « vérifié » (coche dans un sceau) pour les entreprises dont l'identité est validée. */
export function VerifiedBadge({ label, size = 14, className = "" }: { label?: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${className}`} style={{ color: "#15803d" }} title="Identité vérifiée">
      <BadgeCheck size={size} className="shrink-0" fill="#16a34a" stroke="#ffffff" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}
