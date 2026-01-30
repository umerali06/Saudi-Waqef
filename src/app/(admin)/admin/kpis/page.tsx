"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type Kpis = {
  activeCompanies: number;
  invoicesLast30Days: number;
  invoicesPerCompany: number;
  payrollRunsLast30Days: number;
  supportTicketsLast30Days: number;
  mrr: number;
  churnLast30Days: number;
  arpu: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  onboardingConversionRate: number;
  generatedAt: string;
};

export default function AdminKpisPage() {
  const { t, locale } = useTranslations();
  const { formatNumber, formatCurrency, formatPercent, formatDateTime } =
    useLocaleFormatters();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/kpis")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setKpis(data.kpis ?? null))
      .catch(() => setError(t("admin.errors.loadFailed")));
  }, [t]);

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  if (!kpis) {
    return <p className="text-sm text-muted">{t("common.loading")}</p>;
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.kpis.title")}</h1>
        <p className="text-sm text-muted">{t("admin.kpis.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="app-panel p-4">
          <p className="text-xs text-muted">{t("admin.kpis.activeCompanies")}</p>
          <p className="text-xl font-semibold">{formatNumber(kpis.activeCompanies)}</p>
        </div>
        <div className="app-panel p-4">
          <p className="text-xs text-muted">{t("admin.kpis.mrr")}</p>
          <p className="text-xl font-semibold">{formatCurrency(kpis.mrr)}</p>
        </div>
        <div className="app-panel p-4">
          <p className="text-xs text-muted">{t("admin.kpis.arpu")}</p>
          <p className="text-xl font-semibold">{formatCurrency(kpis.arpu)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="app-card p-4">
          <p className="text-xs text-muted">{t("admin.kpis.invoices")}</p>
          <p className="text-lg font-semibold">{formatNumber(kpis.invoicesLast30Days)}</p>
          <p className="text-xs text-muted">
            {t("admin.kpis.invoicesPerCompany")}:{" "}
            {formatNumber(kpis.invoicesPerCompany)}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs text-muted">{t("admin.kpis.payrollRuns")}</p>
          <p className="text-lg font-semibold">{formatNumber(kpis.payrollRunsLast30Days)}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs text-muted">{t("admin.kpis.supportTickets")}</p>
          <p className="text-lg font-semibold">{formatNumber(kpis.supportTicketsLast30Days)}</p>
        </div>
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("admin.kpis.onboardingTitle")}</h2>
            <p className="text-xs text-muted">{t("admin.kpis.onboardingSubtitle")}</p>
          </div>
          <div className={`text-xs text-muted ${alignClass}`}>
            {t("admin.kpis.generatedAt")}: {formatDateTime(kpis.generatedAt)}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <p className="text-xs text-muted">{t("admin.kpis.onboardingStarted")}</p>
            <p className="text-lg font-semibold">{formatNumber(kpis.onboardingStarted)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <p className="text-xs text-muted">{t("admin.kpis.onboardingCompleted")}</p>
            <p className="text-lg font-semibold">{formatNumber(kpis.onboardingCompleted)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <p className="text-xs text-muted">{t("admin.kpis.onboardingConversion")}</p>
            <p className="text-lg font-semibold">
              {formatPercent(kpis.onboardingConversionRate / 100, 1)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <p className="text-xs text-muted">{t("admin.kpis.churn")}</p>
            <p className="text-lg font-semibold">{formatNumber(kpis.churnLast30Days)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <p className="text-xs text-muted">{t("admin.kpis.notes")}</p>
            <p className="text-xs text-muted">{t("admin.kpis.notesHint")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
