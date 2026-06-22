"use client";
import { useFcmToken } from "@/hooks/use-fcm-token";
import { useAuth } from "@/lib/auth-context";

export function FcmInit() {
  const { user } = useAuth();
  useFcmToken(user?.uid);
  return null;
}
