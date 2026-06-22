import { adminMessaging, adminDb } from "@/lib/firebase-admin";
import type { NotificationItem } from "@/types";

interface PushParams {
  uid: string;
  title: string;
  body: string;
  type: NotificationItem["type"];
  companyId?: string;
  link?: string;
}

export async function sendPushAndStore(params: PushParams): Promise<void> {
  const db = adminDb();

  const notifRef = db.collection("notifications").doc();
  await notifRef.set({
    id: notifRef.id,
    uid: params.uid,
    companyId: params.companyId ?? null,
    title: params.title,
    body: params.body,
    type: params.type,
    read: false,
    createdAt: Date.now(),
    link: params.link ?? null,
  });

  try {
    const userDoc = await db.collection("users").doc(params.uid).get();
    const tokens: string[] = userDoc.data()?.fcmTokens ?? [];
    if (!tokens.length) return;

    const messaging = adminMessaging();
    await messaging.sendEachForMulticast({
      tokens,
      notification: { title: params.title, body: params.body },
      webpush: {
        fcmOptions: { link: params.link ?? "/dashboard" },
        notification: { icon: "/icons/icon-192.png" },
      },
      data: { type: params.type, link: params.link ?? "/dashboard" },
    });
  } catch (err) {
    console.error("Push notification error:", err);
  }
}
