import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ size = "md", showText = true }: { size?: "sm" | "md" | "lg"; showText?: boolean }) {
  const dims = { sm: "w-7 h-7", md: "w-9 h-9", lg: "w-11 h-11" };
  const iconDims = { sm: 14, md: 18, lg: 22 };
  const textSize = { sm: "text-sm", md: "text-base", lg: "text-lg" };

  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className={cn("rounded-xl bg-brand-700 flex items-center justify-center shrink-0", dims[size])}>
        <Zap size={iconDims[size]} className="text-white" fill="white" />
      </div>
      {showText && <span className={cn("font-medium text-ink-900", textSize[size])}>Verzapay</span>}
    </Link>
  );
}