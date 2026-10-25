"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Company } from "@/types";

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => Promise<void>;
  loading: boolean;
  refreshCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, appUser } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Récupérer les entreprises en temps réel
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "companies"), 
      where("members", "array-contains", user.uid)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const list: Company[] = [];
      snap.forEach((doc) => {
        list.push({
          id: doc.id, // 🔥 C'EST LA CORRECTION IMPORTANTE
          ...doc.data()
        } as Company);
      });
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setCompanies(list);
      setLoading(false);
    }, (error) => {
      console.error("Erreur chargement entreprises:", error);
      setLoading(false);
    });
    
    return unsub;
  }, [user]);

  // Initialiser l'entreprise active
  useEffect(() => {
    if (loading || companies.length === 0) return;

    // Une entreprise active valide est conservée : une mise à jour d'une entreprise (ex. frais à
    // charge) ne doit JAMAIS ramener sur celle qui était active à la connexion.
    if (activeCompanyId && companies.some((c) => c.id === activeCompanyId)) return;

    // Priorité: activeCompanyId de l'utilisateur
    if (appUser?.activeCompanyId) {
      const exists = companies.some(c => c.id === appUser.activeCompanyId);
      if (exists) {
        setActiveCompanyIdState(appUser.activeCompanyId);
        return;
      }
    }

    // Sinon: localStorage
    const savedId = typeof window !== "undefined" 
      ? localStorage.getItem("activeCompanyId") 
      : null;
    if (savedId && companies.some(c => c.id === savedId)) {
      setActiveCompanyIdState(savedId);
      if (user) {
        updateDoc(doc(db, "users", user.uid), { activeCompanyId: savedId })
          .catch(console.error);
      }
      return;
    }

    // Sinon: première entreprise
    setActiveCompanyIdState(companies[0].id);
    if (user) {
      updateDoc(doc(db, "users", user.uid), { activeCompanyId: companies[0].id })
        .catch(console.error);
    }
  }, [companies, appUser, user, loading, activeCompanyId]);

  async function setActiveCompanyId(id: string) {
    if (!user) return;
    
    const company = companies.find(c => c.id === id);
    if (!company) {
      console.error("Entreprise non trouvée:", id);
      return;
    }

    setActiveCompanyIdState(id);
    
    if (typeof window !== "undefined") {
      localStorage.setItem("activeCompanyId", id);
    }
    
    try {
      await updateDoc(doc(db, "users", user.uid), { activeCompanyId: id });
    } catch (err) {
      console.error("Erreur mise à jour entreprise active:", err);
      // Rollback
      setActiveCompanyIdState(activeCompanyId);
    }
  }

  async function refreshCompanies() {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "companies"), 
        where("members", "array-contains", user.uid)
      );
      const snap = await getDocs(q);
      const list: Company[] = [];
      snap.forEach((doc) => {
        list.push({
          id: doc.id,
          ...doc.data()
        } as Company);
      });
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setCompanies(list);
    } catch (err) {
      console.error("Erreur refresh:", err);
    }
    setLoading(false);
  }

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null;

  return (
    <CompanyContext.Provider 
      value={{ 
        companies, 
        activeCompany, 
        setActiveCompanyId, 
        loading,
        refreshCompanies 
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany doit être utilisé dans CompanyProvider");
  return ctx;
}