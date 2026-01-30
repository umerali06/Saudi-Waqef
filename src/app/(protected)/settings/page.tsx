"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export default function SettingsPage() {
  const { t } = useTranslations();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/settings/company-profile"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.companyProfile.link")}
        </Link>
        <Link
          href="/onboarding"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.onboarding.link")}
        </Link>
        <Link
          href="/settings/chart-of-accounts"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.chartOfAccounts.link")}
        </Link>
        <Link
          href="/settings/opening-balances"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.openingBalances.link")}
        </Link>
        <Link
          href="/settings/accounting-periods"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.accountingPeriods.link")}
        </Link>
        <Link
          href="/settings/accounting-defaults"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.accountingDefaults.link")}
        </Link>
        <Link
          href="/settings/journal-entries"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.journalEntries.link")}
        </Link>
        <Link
          href="/settings/document-branding"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.documentBranding.link")}
        </Link>
        <Link
          href="/settings/document-templates"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.documentTemplates.link")}
        </Link>
        <Link
          href="/settings/numbering"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.numbering.link")}
        </Link>
        <Link
          href="/settings/preferences"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.preferences.link")}
        </Link>
        <Link
          href="/settings/approvals"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.approvals.link")}
        </Link>
        <Link
          href="/settings/companies"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.companyLink")}
        </Link>
        <Link
          href="/billing"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.billing.link")}
        </Link>
        <Link
          href="/billing/plans"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.billingPlans.link")}
        </Link>
        <Link
          href="/settings/users"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.userLink")}
        </Link>
        <Link
          href="/settings/roles-permissions"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.rolesPermissions.link")}
        </Link>
        <Link
          href="/settings/security"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.security.link")}
        </Link>
        <Link
          href="/settings/audit-log"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.auditLog.link")}
        </Link>
        <Link
          href="/settings/notifications"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.notifications.link")}
        </Link>
        <Link
          href="/settings/data-imports"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.dataImports.link")}
        </Link>
        <Link
          href="/settings/integrations"
          className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {t("settings.integrations.link")}
        </Link>
      </div>
    </section>
  );
}
