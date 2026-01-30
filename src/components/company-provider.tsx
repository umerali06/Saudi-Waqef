"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CompanySummary } from "@/lib/types";

type CompanyContextValue = {
  companies: CompanySummary[];
  activeCompanyId: string | null;
  activeCompany: CompanySummary | null;
  setActiveCompanyId: (companyId: string) => void;
};

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({
  companies,
  activeCompanyId,
  children,
}: {
  companies: CompanySummary[];
  activeCompanyId: string | null;
  children: React.ReactNode;
}) {
  const [currentCompanyId, setCurrentCompanyId] = useState(activeCompanyId);

  useEffect(() => {
    if (!currentCompanyId) {
      return;
    }
    document.cookie = `active_company=${currentCompanyId}; path=/; max-age=${
      60 * 60 * 24 * 365
    }`;
  }, [currentCompanyId]);

  const value = useMemo(() => {
    const activeCompany = companies.find(
      (company) => company.id === currentCompanyId
    );
    return {
      companies,
      activeCompanyId: currentCompanyId,
      activeCompany: activeCompany ?? null,
      setActiveCompanyId: (companyId: string) => {
        setCurrentCompanyId(companyId);
        document.cookie = `active_company=${companyId}; path=/; max-age=${
          60 * 60 * 24 * 365
        }`;
      },
    };
  }, [companies, currentCompanyId]);

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompany must be used within CompanyProvider");
  }
  return context;
}
