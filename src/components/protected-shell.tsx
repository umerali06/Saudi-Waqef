"use client";

import { SessionProvider } from "next-auth/react";
import { AppShell } from "@/components/app-shell";
import { CompanyProvider } from "@/components/company-provider";
import { NotificationsProvider } from "@/components/notifications-provider";
import type { CompanySummary } from "@/lib/types";

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
        <NotificationsProvider>
          <AppShell>{children}</AppShell>
        </NotificationsProvider>
      </CompanyProvider>
    </SessionProvider>
  );
}
