"use client";

import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

export default function ReportsPage() {
  const { activeCompany } = useCompany();
  const { t } = useTranslations();
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
    </section>
  );
}
