"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function NewPayoutPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/payouts"); }, [router]);
  return null;
}
