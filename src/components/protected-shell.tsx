"use client";

import { SessionProvider } from "next-auth/react";
import { AppShell } from "@/components/app-shell";
import { CompanyProvider, useCompany } from "@/components/company-provider";
import { NotificationsProvider } from "@/components/notifications-provider";
import type { CompanySummary } from "@/lib/types";

function CompanyNotifications({ children }: { children: React.ReactNode }) {
  const { activeCompanyId } = useCompany();
  return <NotificationsProvider companyId={activeCompanyId}>{children}</NotificationsProvider>;
}

export function ProtectedShell({
  companies,
  activeCompanyId,
  children,
}: {
  companies: CompanySummary[];
  activeCompanyId: string | null;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <CompanyProvider companies={companies} activeCompanyId={activeCompanyId}>
        <CompanyNotifications>
          <AppShell>{children}</AppShell>
        </CompanyNotifications>
      </CompanyProvider>
    </SessionProvider>
  );
}
