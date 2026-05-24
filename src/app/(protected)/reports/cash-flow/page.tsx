"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type CashFlowAccount = {
  accountId: string;
  name: string;
  opening: number;
  change: number;
  closing: number;
};

type CashFlowReport = {
  period: { startDate: string; endDate: string };
  openingCash: number;
  closingCash: number;
  netCashChange: number;
  netProfit: number;
  assetChange: number;
  liabilityChange: number;
  equityChange: number;
  netCashFromOperations: number;
  netCashFromInvesting: number;
  netCashFromFinancing: number;
  otherChange: number;
  cashAccounts: CashFlowAccount[];
};

export default function CashFlowPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { formatNumber } = useLocaleFormatters();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatAmount = (value: number) =>
    formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadReport = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    if (!startDate || !endDate) {
      setErrorKey("reports.cashFlow.missingRange");
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      startDate,
      endDate,
    });
    setErrorKey(null);
    startTransition(() => {
      fetch(`/api/reports/cash-flow?${params.toString()}`)
        .then((res) => res.json())
        .then((payload) => {
          if (payload?.error) {
            setErrorKey("error.loadFailed");
            return;
          }
          setReport(payload);
        })
        .catch(() => setErrorKey("error.loadFailed"));
    });
  }, [activeCompanyId, endDate, startDate, startTransition]);

  const handleExport = (format: "csv" | "pdf") => {
    if (!activeCompanyId || !startDate || !endDate) {
      setErrorKey("reports.cashFlow.missingRange");
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      startDate,
      endDate,
      format,
    });
    startTransition(async () => {
      const response = await fetch(`/api/reports/cash-flow/export?${params}`);
      if (!response.ok) {
        setErrorKey("reports.exportFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "pdf" ? "cash-flow.pdf" : "cash-flow.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  useEffect(() => {
    if (activeCompanyId && startDate && endDate) {
      loadReport();
    }
  }, [activeCompanyId, endDate, loadReport, startDate]);

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("reports.cashFlow.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("reports.cashFlow.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-end gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.cashFlow.startDate")}
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
              {t("reports.cashFlow.endDate")}
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
            {t("reports.cashFlow.view")}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.cashFlow.exportCsv")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.cashFlow.exportPdf")}
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
            <p className="text-xs text-muted">{t("reports.cashFlow.openingCash")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.openingCash)}</p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.cashFlow.netChange")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.netCashChange)}</p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.cashFlow.closingCash")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.closingCash)}</p>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="app-card p-6 card-modern">
          <h2 className="text-lg font-semibold">{t("reports.cashFlow.operating")}</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("reports.cashFlow.netProfit")}</span>
              <span className="font-semibold">{formatAmount(report.netProfit)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("reports.cashFlow.assetChange")}</span>
              <span className="font-semibold">{formatAmount(report.assetChange)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("reports.cashFlow.liabilityChange")}</span>
              <span className="font-semibold">{formatAmount(report.liabilityChange)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("reports.cashFlow.otherChange")}</span>
              <span className="font-semibold">{formatAmount(report.otherChange)}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-semibold">
              <span>{t("reports.cashFlow.netFromOperations")}</span>
              <span>{formatAmount(report.netCashFromOperations)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="app-card p-6 card-modern">
            <h2 className="text-lg font-semibold">{t("reports.cashFlow.investing")}</h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>{t("reports.cashFlow.netFromInvesting")}</span>
              <span className="font-semibold">
                {formatAmount(report.netCashFromInvesting)}
              </span>
            </div>
          </div>
          <div className="app-card p-6 card-modern">
            <h2 className="text-lg font-semibold">{t("reports.cashFlow.financing")}</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{t("reports.cashFlow.equityChange")}</span>
                <span className="font-semibold">{formatAmount(report.equityChange)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 font-semibold">
                <span>{t("reports.cashFlow.netFromFinancing")}</span>
                <span>{formatAmount(report.netCashFromFinancing)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="app-card overflow-hidden card-modern">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold">
            {t("reports.cashFlow.cashAccounts")}
          </div>
          {report.cashAccounts.length === 0 ? (
            <div className="p-4 text-sm text-muted">{t("reports.cashFlow.empty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-4 py-2 ${alignClass}`}>
                      {t("reports.cashFlow.account")}
                    </th>
                    <th className={`px-4 py-2 ${alignClass}`}>
                      {t("reports.cashFlow.openingCash")}
                    </th>
                    <th className={`px-4 py-2 ${alignClass}`}>
                      {t("reports.cashFlow.change")}
                    </th>
                    <th className={`px-4 py-2 ${alignClass}`}>
                      {t("reports.cashFlow.closingCash")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.cashAccounts.map((account) => (
                    <tr key={account.accountId}>
                      <td className="px-4 py-2 font-semibold">{account.name}</td>
                      <td className="px-4 py-2">{formatAmount(account.opening)}</td>
                      <td className="px-4 py-2">{formatAmount(account.change)}</td>
                      <td className="px-4 py-2">{formatAmount(account.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
