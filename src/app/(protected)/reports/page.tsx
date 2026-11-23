"use client";

import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

const LEDGER_TOOLS = [
  { href: "/settings/journal-entries", labelKey: "settings.journalEntries.link" },
  { href: "/settings/chart-of-accounts", labelKey: "settings.chartOfAccounts.link" },
  { href: "/settings/opening-balances", labelKey: "settings.openingBalances.link" },
  { href: "/settings/accounting-periods", labelKey: "settings.accountingPeriods.link" },
];

export default function ReportsPage() {
  const { activeCompany } = useCompany();
  const { t } = useTranslations();
  const canPost = ["owner", "admin", "accountant"].includes(activeCompany?.role ?? "");
  return (
    <section className="space-y-4 page-shell">
      <h1 className="text-2xl font-semibold page-title">{t("reports.title")}</h1>
      <p className="text-sm text-muted page-subtitle">
        {t("labels.activeCompany", {
          company: activeCompany?.name ?? t("common.na"),
        })}
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/reports/profit-loss"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("reports.profitLossCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("reports.profitLossCardDescription")}
          </p>
        </Link>
        <Link
          href="/reports/balance-sheet"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("reports.balanceSheetCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("reports.balanceSheetCardDescription")}
          </p>
        </Link>
        <Link
          href="/reports/cash-flow"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("reports.cashFlowCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("reports.cashFlowCardDescription")}
          </p>
        </Link>
        <Link
          href="/reports/trial-balance"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("reports.trialBalanceCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("reports.trialBalanceCardDescription")}
          </p>
        </Link>
        <Link
          href="/reports/general-ledger"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("reports.ledgerCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("reports.ledgerCardDescription")}
          </p>
        </Link>
        <Link
          href="/reports/vat"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("reports.vatCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("reports.vatCardDescription")}
          </p>
        </Link>
        <Link
          href="/reports/exports"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("reports.exportCenterCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("reports.exportCenterCardDescription")}
          </p>
        </Link>
      </div>
      {canPost ? (
        <>
          <h2 className="text-lg font-semibold">{t("reports.ledgerToolsTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {LEDGER_TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="app-card p-6 text-sm transition hover:-translate-y-0.5 hover:shadow-md card-modern"
              >
                {t(tool.labelKey)}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
