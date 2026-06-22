import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

function getAdminApp(): App {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Variables d'environnement Firebase Admin manquantes (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)"
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

// Import dynamique volontaire : "firebase-admin/auth" entraîne la dépendance
// "jwks-rsa" -> "jose" (module ESM-only) qui fait planter Turbopack au build
// si elle est importée de façon statique, même dans les routes qui n'utilisent
// jamais adminAuth(). En la chargeant à la demande, seules les routes qui
// appellent réellement adminAuth() déclenchent ce chargement.
export async function adminAuth() {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(getAdminApp());
}

export function adminMessaging(): Messaging {
  return getMessaging(getAdminApp());
}
