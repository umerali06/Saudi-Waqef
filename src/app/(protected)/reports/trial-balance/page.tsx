"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  openingDebit: number;
  openingCredit: number;
  movementDebit: number;
  movementCredit: number;
  closingDebit: number;
  closingCredit: number;
  compareDebit: number;
  compareCredit: number;
};

type TrialBalanceResponse = {
  rows: TrialBalanceRow[];
  totals: {
    openingDebit: number;
    openingCredit: number;
    movementDebit: number;
    movementCredit: number;
    closingDebit: number;
    closingCredit: number;
    compareDebit: number;
    compareCredit: number;
  };
  range: { startDate: string | null; endDate: string | null };
  compareRange: { startDate: string; endDate: string } | null;
};

export default function TrialBalancePage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { formatNumber } = useLocaleFormatters();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareStartDate, setCompareStartDate] = useState("");
  const [compareEndDate, setCompareEndDate] = useState("");
  const [data, setData] = useState<TrialBalanceResponse | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatAmount = (value: number) =>
    formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadTrialBalance = useCallback(() => {
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
    startTransition(() => {
      fetch(`/api/reports/trial-balance?${params.toString()}`)
        .then((res) => res.json())
        .then((payload) => {
          if (payload?.error) {
            setErrorKey("error.loadFailed");
            return;
          }
          setData(payload);
        })
        .catch(() => setErrorKey("error.loadFailed"));
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
      const response = await fetch(`/api/reports/trial-balance/export?${params}`);
      if (!response.ok) {
        setErrorKey("reports.exportFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "pdf" ? "trial-balance.pdf" : "trial-balance.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  useEffect(() => {
    loadTrialBalance();
  }, [loadTrialBalance]);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("reports.trialBalance.title")}</h1>
        <p className="text-sm text-muted">{t("reports.trialBalance.subtitle")}</p>
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.trialBalance.startDate")}
            </span>
            <input
              type="date"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.trialBalance.endDate")}
            </span>
            <input
              type="date"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={loadTrialBalance}
            disabled={isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("reports.trialBalance.view")}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compareEnabled}
              onChange={(event) => setCompareEnabled(event.target.checked)}
            />
            {t("reports.trialBalance.compareToggle")}
          </label>
          {compareEnabled ? (
            <>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("reports.trialBalance.compareStartDate")}
                </span>
                <input
                  type="date"
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={compareStartDate}
                  onChange={(event) => setCompareStartDate(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("reports.trialBalance.compareEndDate")}
                </span>
                <input
                  type="date"
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.trialBalance.exportCsv")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={isPending}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.trialBalance.exportPdf")}
          </button>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("reports.trialBalance.tableTitle")}
        </div>
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("reports.trialBalance.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.trialBalance.account")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.trialBalance.openingDebit")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.trialBalance.openingCredit")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.trialBalance.movementDebit")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.trialBalance.movementCredit")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.trialBalance.closingDebit")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.trialBalance.closingCredit")}
                  </th>
                  {data?.compareRange ? (
                    <>
                      <th className={`px-4 py-2 ${alignClass}`}>
                        {t("reports.trialBalance.compareDebit")}
                      </th>
                      <th className={`px-4 py-2 ${alignClass}`}>
                        {t("reports.trialBalance.compareCredit")}
                      </th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.accountId}>
                    <td className="px-4 py-2 font-semibold">
                      {row.code} - {row.name}
                    </td>
                    <td className="px-4 py-2">{formatAmount(row.openingDebit)}</td>
                    <td className="px-4 py-2">{formatAmount(row.openingCredit)}</td>
                    <td className="px-4 py-2">{formatAmount(row.movementDebit)}</td>
                    <td className="px-4 py-2">{formatAmount(row.movementCredit)}</td>
                    <td className="px-4 py-2">{formatAmount(row.closingDebit)}</td>
                    <td className="px-4 py-2">{formatAmount(row.closingCredit)}</td>
                    {data?.compareRange ? (
                      <>
                        <td className="px-4 py-2">{formatAmount(row.compareDebit)}</td>
                        <td className="px-4 py-2">{formatAmount(row.compareCredit)}</td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-muted text-muted">
                <tr>
                  <td className="px-4 py-2 font-semibold">
                    {t("reports.trialBalance.total")}
                  </td>
                  <td className="px-4 py-2 font-semibold">
                    {formatAmount(data?.totals.openingDebit ?? 0)}
                  </td>
                  <td className="px-4 py-2 font-semibold">
                    {formatAmount(data?.totals.openingCredit ?? 0)}
                  </td>
                  <td className="px-4 py-2 font-semibold">
                    {formatAmount(data?.totals.movementDebit ?? 0)}
                  </td>
                  <td className="px-4 py-2 font-semibold">
                    {formatAmount(data?.totals.movementCredit ?? 0)}
                  </td>
                  <td className="px-4 py-2 font-semibold">
                    {formatAmount(data?.totals.closingDebit ?? 0)}
                  </td>
                  <td className="px-4 py-2 font-semibold">
                    {formatAmount(data?.totals.closingCredit ?? 0)}
                  </td>
                  {data?.compareRange ? (
                    <>
                      <td className="px-4 py-2 font-semibold">
                        {formatAmount(data?.totals.compareDebit ?? 0)}
                      </td>
                      <td className="px-4 py-2 font-semibold">
                        {formatAmount(data?.totals.compareCredit ?? 0)}
                      </td>
                    </>
                  ) : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
