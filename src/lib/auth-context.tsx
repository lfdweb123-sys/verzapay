"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { AppUser } from "@/types";

interface AuthContextValue {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  twoFactorVerified: boolean;
  setTwoFactorVerified: (v: boolean) => void;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function sessionKeyFor(uid: string) {
  return `verzapay_2fa_verified_${uid}`;
}

async function ensureUserDoc(user: User): Promise<AppUser> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as AppUser;
  }
  const newUser: AppUser = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "Utilisateur",
    photoURL: user.photoURL ?? null,
    createdAt: Date.now(),
    activeCompanyId: null,
    fcmTokens: [],
    isAdmin: false,
    theme: "light",
    twoFactorEnabled: true,
    transactionTwoFactorEnabled: true,
  };
  await setDoc(ref, { ...newUser, createdAt: serverTimestamp() });
  return newUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [twoFactorVerified, setTwoFactorVerifiedState] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() as AppUser & {
          emailChangePending?: boolean;
        }) : null;

        // Changement d'email validé par admin en attente de confirmation
        // → déconnecter et rediriger vers /login?emailChange=1
        if (data?.emailChangePending) {
          if (typeof window !== "undefined") {
            sessionStorage.setItem("emailChangeUid", u.uid);
          }
          await firebaseSignOut(auth);
          // onAuthStateChanged va se re-déclencher avec u=null,
          // on laisse le redirect ici
          window.location.href = "/login?emailChange=1";
          return;
        }

        const profile = data ?? (await ensureUserDoc(u));
        setUser(u);
        setAppUser(profile);

        // Restaurer l'état 2FA de cette session si déjà vérifié
        const stored =
          typeof window !== "undefined"
            ? sessionStorage.getItem(sessionKeyFor(u.uid))
            : null;
        setTwoFactorVerifiedState(stored === "true");
      } else {
        setUser(null);
        setAppUser(null);
        setTwoFactorVerifiedState(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  function setTwoFactorVerified(v: boolean) {
    setTwoFactorVerifiedState(v);
    if (user && typeof window !== "undefined") {
      if (v) sessionStorage.setItem(sessionKeyFor(user.uid), "true");
      else sessionStorage.removeItem(sessionKeyFor(user.uid));
    }
  }

  async function registerWithEmail(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user);
  }

  async function loginWithEmail(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserDoc(cred.user);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function logout() {
    if (user && typeof window !== "undefined") {
      sessionStorage.removeItem(sessionKeyFor(user.uid));
    }
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        loading,
        twoFactorVerified,
        setTwoFactorVerified,
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        resetPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}