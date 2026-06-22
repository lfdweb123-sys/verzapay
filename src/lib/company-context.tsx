"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Company } from "@/types";

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => Promise<void>;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, appUser } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "companies"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as Company);
      list.sort((a, b) => a.createdAt - b.createdAt);
      setCompanies(list);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (appUser?.activeCompanyId) {
      setActiveCompanyIdState(appUser.activeCompanyId);
    } else if (companies.length > 0 && !activeCompanyId) {
      setActiveCompanyIdState(companies[0].id);
    }
  }, [appUser, companies, activeCompanyId]);

  async function setActiveCompanyId(id: string) {
    setActiveCompanyIdState(id);
    if (user) {
      await updateDoc(doc(db, "users", user.uid), { activeCompanyId: id });
    }
  }

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null;

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, setActiveCompanyId, loading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany doit être utilisé dans CompanyProvider");
  return ctx;
}
