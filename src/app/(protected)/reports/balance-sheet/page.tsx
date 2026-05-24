"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type BalanceSheetAccount = {
  accountId: string;
  code: string;
  name: string;
  amount: number;
};

type BalanceSheetSection = {
  total: number;
  accounts: BalanceSheetAccount[];
};

type BalanceSheetReport = {
  asOfDate: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilitiesEquity: number;
  };
  difference: number;
};

export default function BalanceSheetPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { formatNumber } = useLocaleFormatters();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatAmount = (value: number) =>
    formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadReport = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      asOfDate,
    });
    setErrorKey(null);
    startTransition(() => {
      fetch(`/api/reports/balance-sheet?${params.toString()}`)
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
  }, [activeCompanyId, asOfDate, startTransition]);

  const handleExport = (format: "csv" | "pdf") => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      asOfDate,
      format,
    });
    startTransition(async () => {
      const response = await fetch(`/api/reports/balance-sheet/export?${params}`);
      if (!response.ok) {
        setErrorKey("reports.exportFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "pdf" ? "balance-sheet.pdf" : "balance-sheet.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const renderSection = (title: string, section: BalanceSheetSection) => (
    <div className="app-card overflow-hidden card-modern">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">
        {title}
      </div>
      {section.accounts.length === 0 ? (
        <div className="p-4 text-sm text-muted">{t("reports.balanceSheet.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-modern">
            <thead className="bg-surface-muted text-muted thead-modern">
              <tr>
                <th className={`px-4 py-2 ${alignClass}`}>
                  {t("reports.balanceSheet.account")}
                </th>
                <th className={`px-4 py-2 ${alignClass}`}>
                  {t("reports.balanceSheet.amount")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {section.accounts.map((account) => {
                const link = `/reports/general-ledger?accountId=${account.accountId}&endDate=${asOfDate}`;
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
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-muted text-muted">
              <tr>
                <td className="px-4 py-2 font-semibold">
                  {t("reports.balanceSheet.sectionTotal")}
                </td>
                <td className="px-4 py-2 font-semibold">
                  {formatAmount(section.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("reports.balanceSheet.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("reports.balanceSheet.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-end gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.balanceSheet.asOfDate")}
            </span>
            <input
              type="date"
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={loadReport}
            disabled={isPending}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("reports.balanceSheet.view")}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.balanceSheet.exportCsv")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.balanceSheet.exportPdf")}
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
            <p className="text-xs text-muted">{t("reports.balanceSheet.assets")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.totals.assets)}</p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.balanceSheet.liabilities")}</p>
            <p className="text-xl font-semibold">
              {formatAmount(report.totals.liabilities)}
            </p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.balanceSheet.equity")}</p>
            <p className="text-xl font-semibold">{formatAmount(report.totals.equity)}</p>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="app-panel p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("reports.balanceSheet.totalAssets")}</span>
            <span className="font-semibold">{formatAmount(report.totals.assets)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span>{t("reports.balanceSheet.totalLiabilitiesEquity")}</span>
            <span className="font-semibold">
              {formatAmount(report.totals.liabilitiesEquity)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span>{t("reports.balanceSheet.difference")}</span>
            <span
              className={`font-semibold ${
                Math.abs(report.difference) < 0.01 ? "text-foreground" : "text-red-500"
              }`}
            >
              {formatAmount(report.difference)}
            </span>
          </div>
        </div>
      ) : null}

      {report ? renderSection(t("reports.balanceSheet.assets"), report.assets) : null}
      {report ? renderSection(t("reports.balanceSheet.liabilities"), report.liabilities) : null}
      {report ? renderSection(t("reports.balanceSheet.equity"), report.equity) : null}
    </section>
  );
}
