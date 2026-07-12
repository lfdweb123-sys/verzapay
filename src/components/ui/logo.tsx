import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ size = "md", showText = true }: { size?: "sm" | "md" | "lg"; showText?: boolean }) {
  const heightClass = { sm: "h-8", md: "h-10", lg: "h-12" };
  const textSize = { sm: "text-sm", md: "text-base", lg: "text-lg" };

  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/icons/verzapay.png"
        alt="Verzapay"
        width={200}
        height={52}
        priority
        className={cn("w-auto object-contain", heightClass[size])}
      />
      {showText && <span className={cn("font-medium text-ink-900", textSize[size])}>Verzapay</span>}
    </Link>
  );
}
