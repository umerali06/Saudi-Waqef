"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type ProfitLossAccount = {
  accountId: string;
  code: string;
  name: string;
  amount: number;
};

type ProfitLossSection = {
  total: number;
  accounts: ProfitLossAccount[];
};

type ProfitLossReport = {
  period: { startDate: string | null; endDate: string | null };
  comparePeriod: { startDate: string; endDate: string } | null;
  revenue: ProfitLossSection;
  cogs: ProfitLossSection;
  expenses: ProfitLossSection;
  grossProfit: number;
  netProfit: number;
  compare: {
    revenue: ProfitLossSection;
    cogs: ProfitLossSection;
    expenses: ProfitLossSection;
    grossProfit: number;
    netProfit: number;
  } | null;
};

export default function ProfitLossPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { formatNumber } = useLocaleFormatters();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareStartDate, setCompareStartDate] = useState("");
  const [compareEndDate, setCompareEndDate] = useState("");
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const formatAmount = (value: number) =>
    formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadReport = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (startDate) {
      params.set("startDate", startDate);
    }
    if (endDate) {
      params.set("endDate", endDate);
    }
    if (compareEnabled && compareStartDate && compareEndDate) {
      params.set("compareStartDate", compareStartDate);
      params.set("compareEndDate", compareEndDate);
    }
    setErrorKey(null);
    setLoading(true);
    startTransition(() => {
      fetch(`/api/reports/profit-loss?${params.toString()}`)
        .then((res) => res.json())
        .then((payload) => {
          if (payload?.error) {
            setErrorKey("error.loadFailed");
            return;
          }
          setReport(payload);
        })
        .catch(() => setErrorKey("error.loadFailed"))
        .finally(() => setLoading(false));
    });
  }, [
    activeCompanyId,
    compareEnabled,
    compareEndDate,
    compareStartDate,
    endDate,
    startDate,
    startTransition,
  ]);

  const handleExport = (format: "csv" | "pdf") => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      format,
    });
    if (startDate) {
      params.set("startDate", startDate);
    }
    if (endDate) {
      params.set("endDate", endDate);
    }
    if (compareEnabled && compareStartDate && compareEndDate) {
      params.set("compareStartDate", compareStartDate);
      params.set("compareEndDate", compareEndDate);
    }
    startTransition(async () => {
      const response = await fetch(`/api/reports/profit-loss/export?${params}`);
      if (!response.ok) {
        setErrorKey("reports.exportFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "pdf" ? "profit-loss.pdf" : "profit-loss.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const compareMap = useMemo(() => {
    if (!report?.compare) {
      return null;
    }
    const toMap = (section: ProfitLossSection) =>
      new Map(section.accounts.map((account) => [account.accountId, account.amount]));
    return {
      revenue: toMap(report.compare.revenue),
      cogs: toMap(report.compare.cogs),
      expenses: toMap(report.compare.expenses),
    };
  }, [report]);

  const renderSection = (
    title: string,
    section: ProfitLossSection,
    compareSection?: ProfitLossSection,
    compareLookup?: Map<string, number> | null
  ) => (
    <div className="app-card overflow-hidden card-modern">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">
        {title}
      </div>
      {section.accounts.length === 0 ? (
        <div className="p-4 text-sm text-muted">{t("reports.profitLoss.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-modern">
            <thead className="bg-surface-muted text-muted thead-modern">
              <tr>
                <th className={`px-4 py-2 ${alignClass}`}>
                  {t("reports.profitLoss.account")}
                </th>
                <th className={`px-4 py-2 ${alignClass}`}>
                  {t("reports.profitLoss.amount")}
                </th>
                {compareSection ? (
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.profitLoss.compareAmount")}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {section.accounts.map((account) => {
                const compareValue = compareLookup?.get(account.accountId);
                const link = `/reports/general-ledger?accountId=${account.accountId}&startDate=${
                  report?.period.startDate ?? ""
                }&endDate=${report?.period.endDate ?? ""}`;
                return (
                  <tr key={account.accountId}>
                    <td className="px-4 py-2">
                      <Link
                        href={link}
                        className="text-xs font-semibold text-primary underline decoration-dotted"
                      >
                        {account.code} - {account.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{formatAmount(account.amount)}</td>
                    {compareSection ? (
                      <td className="px-4 py-2">
                        {formatAmount(compareValue ?? 0)}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-muted text-muted">
              <tr>
                <td className="px-4 py-2 font-semibold">
                  {t("reports.profitLoss.sectionTotal")}
                </td>
                <td className="px-4 py-2 font-semibold">
                  {formatAmount(section.total)}
                </td>
                {compareSection ? (
                  <td className="px-4 py-2 font-semibold">
                    {formatAmount(compareSection.total)}
                  </td>
                ) : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  const showSkeleton = loading && !report;

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("reports.profitLoss.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("reports.profitLoss.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-end gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.profitLoss.startDate")}
            </span>
            <input
              type="date"
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.profitLoss.endDate")}
            </span>
            <input
              type="date"
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={loadReport}
            disabled={isPending}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("reports.profitLoss.view")}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compareEnabled}
              onChange={(event) => setCompareEnabled(event.target.checked)}
            />
            {t("reports.profitLoss.compareToggle")}
          </label>
          {compareEnabled ? (
            <>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("reports.profitLoss.compareStartDate")}
                </span>
                <input
                  type="date"
                  className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={compareStartDate}
                  onChange={(event) => setCompareStartDate(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("reports.profitLoss.compareEndDate")}
                </span>
                <input
                  type="date"
                  className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={compareEndDate}
                  onChange={(event) => setCompareEndDate(event.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.profitLoss.exportCsv")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.profitLoss.exportPdf")}
          </button>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
      </div>

      {report ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.profitLoss.revenue")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.revenue.total)}</p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.profitLoss.grossProfit")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.grossProfit)}</p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.profitLoss.netProfit")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.netProfit)}</p>
          </div>
        </div>
      ) : showSkeleton ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="app-panel space-y-3 p-4">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-7 w-32" />
            </div>
          ))}
        </div>
      ) : null}

      {report
        ? renderSection(
            t("reports.profitLoss.revenue"),
            report.revenue,
            report.compare?.revenue,
            compareMap?.revenue ?? null
          )
        : showSkeleton ? (
            <div className="app-card space-y-3 p-4 card-modern">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          ) : null}
      {report
        ? renderSection(
            t("reports.profitLoss.cogs"),
            report.cogs,
            report.compare?.cogs,
            compareMap?.cogs ?? null
          )
        : showSkeleton ? (
            <div className="app-card space-y-3 p-4 card-modern">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          ) : null}
      {report
        ? renderSection(
            t("reports.profitLoss.expenses"),
            report.expenses,
            report.compare?.expenses,
            compareMap?.expenses ?? null
          )
        : showSkeleton ? (
            <div className="app-card space-y-3 p-4 card-modern">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          ) : null}

      {report ? (
        <div className="app-card p-6 text-sm card-modern">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">{t("reports.profitLoss.grossProfit")}</span>
            <span className="font-semibold">{formatAmount(report.grossProfit)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">{t("reports.profitLoss.netProfit")}</span>
            <span className="font-semibold">{formatAmount(report.netProfit)}</span>
          </div>
        </div>
      ) : showSkeleton ? (
        <div className="app-card space-y-3 p-4 card-modern">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-5/6" />
        </div>
      ) : null}
    </section>
  );
}
