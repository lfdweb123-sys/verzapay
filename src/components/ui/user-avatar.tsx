"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";

interface UserAvatarProps {
  photoURL?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export function UserAvatar({ photoURL, name, size = 32, className }: UserAvatarProps) {
  const [errored, setErrored] = useState(false);
  const s = `${size}px`;

  if (photoURL && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoURL}
        alt={name}
        onError={() => setErrored(true)}
        className={cn("rounded-full object-cover shrink-0 bg-ink-100", className)}
        style={{ width: s, height: s }}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={cn("rounded-full bg-brand-700 flex items-center justify-center text-white font-medium shrink-0", className)}
      style={{ width: s, height: s, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials(name)}
    </div>
  );
}
