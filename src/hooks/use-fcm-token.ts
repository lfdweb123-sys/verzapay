"use client";

import { useEffect } from "react";
import { getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getMessagingIfSupported } from "@/lib/firebase";

export function useFcmToken(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;

    async function registerToken() {
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) return;

      try {
        const messaging = await getMessagingIfSupported();
        if (!messaging) return;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const token = await getToken(messaging, { vapidKey });
        if (!token || !uid) return;

        // Enregistrer le token dans Firestore (tableau dédupliqué)
        await updateDoc(doc(db, "users", uid), {
          fcmTokens: arrayUnion(token),
        });
      } catch (err) {
        console.warn("FCM token registration failed:", err);
      }
    }

    registerToken();
  }, [uid]);
}
