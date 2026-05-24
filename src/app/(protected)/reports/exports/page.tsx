"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
  status: string;
};

type VatPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};

type ReportExport = {
  id: string;
  reportType: string;
  format: string;
  userEmail?: string | null;
  createdAt: string | Date;
  status: string;
  filters?: Record<string, unknown>;
};

type Member = {
  id: string;
  name: string;
  email: string;
};

type ReportOption = {
  value: string;
  labelKey: string;
  formats: string[];
  needsRange?: boolean;
  rangeRequired?: boolean;
  needsAccount?: boolean;
  needsAsOf?: boolean;
  needsVatPeriod?: boolean;
};

const REPORT_OPTIONS: ReportOption[] = [
  {
    value: "profit-loss",
    labelKey: "reports.exportCenter.report.profitLoss",
    formats: ["csv", "pdf"],
    needsRange: true,
  },
  {
    value: "balance-sheet",
    labelKey: "reports.exportCenter.report.balanceSheet",
    formats: ["csv", "pdf"],
    needsAsOf: true,
  },
  {
    value: "cash-flow",
    labelKey: "reports.exportCenter.report.cashFlow",
    formats: ["csv", "pdf"],
    needsRange: true,
    rangeRequired: true,
  },
  {
    value: "trial-balance",
    labelKey: "reports.exportCenter.report.trialBalance",
    formats: ["csv", "pdf"],
    needsRange: true,
  },
  {
    value: "general-ledger",
    labelKey: "reports.exportCenter.report.generalLedger",
    formats: ["csv", "pdf"],
    needsRange: true,
    needsAccount: true,
  },
  {
    value: "vat",
    labelKey: "reports.exportCenter.report.vat",
    formats: ["csv", "pdf", "json"],
    needsVatPeriod: true,
  },
];

export default function ReportsExportCenterPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";

  const [reportType, setReportType] = useState(REPORT_OPTIONS[0].value);
  const [format, setFormat] = useState("csv");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<VatPeriod[]>([]);
  const [exports, setExports] = useState<ReportExport[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filterReportType, setFilterReportType] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterUserId, setFilterUserId] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadId, setDownloadId] = useState<string | null>(null);

  const selectedReport = useMemo(
    () => REPORT_OPTIONS.find((option) => option.value === reportType) ?? REPORT_OPTIONS[0],
    [reportType]
  );

  const handleReportTypeChange = (value: string) => {
    setReportType(value);
    const option = REPORT_OPTIONS.find((entry) => entry.value === value);
    if (option?.formats?.length) {
      setFormat(option.formats[0]);
    }
  };

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale]
  );

  const formatDateTime = (value: string | Date) => {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return formatter.format(date);
  };

  const loadAccounts = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/coa?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setAccounts([]));
  }, [activeCompanyId]);

  const loadPeriods = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/vat/periods?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setPeriods(data.periods ?? []))
      .catch(() => setPeriods([]));
  }, [activeCompanyId]);

  const loadMembers = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/users?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setMembers(data.users ?? []))
      .catch(() => setMembers([]));
  }, [activeCompanyId]);

  const loadExports = useCallback(
    (overrides?: {
      reportType?: string;
      format?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      if (!activeCompanyId) {
        return;
      }
      setLoading(true);
      setErrorKey(null);
      const nextReportType = overrides?.reportType ?? filterReportType;
      const nextFormat = overrides?.format ?? filterFormat;
      const nextUserId = overrides?.userId ?? filterUserId;
      const nextStartDate = overrides?.startDate ?? filterStartDate;
      const nextEndDate = overrides?.endDate ?? filterEndDate;
      const params = new URLSearchParams({ companyId: activeCompanyId });
      if (nextReportType !== "all") params.set("reportType", nextReportType);
      if (nextFormat !== "all") params.set("format", nextFormat);
      if (nextUserId !== "all") params.set("userId", nextUserId);
      if (nextStartDate) params.set("startDate", nextStartDate);
      if (nextEndDate) params.set("endDate", nextEndDate);

      fetch(`/api/reports/exports?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setExports(data.exports ?? []))
        .catch(() => setErrorKey("error.loadFailed"))
        .finally(() => setLoading(false));
    },
    [
      activeCompanyId,
      filterEndDate,
      filterFormat,
      filterReportType,
      filterStartDate,
      filterUserId,
    ]
  );

  useEffect(() => {
    loadAccounts();
    loadPeriods();
    loadMembers();
    loadExports();
  }, [loadAccounts, loadMembers, loadPeriods, loadExports]);

  const handleExport = async () => {
    if (!activeCompanyId) {
      return;
    }

    if (selectedReport.needsAccount && !accountId) {
      setErrorKey("reports.exportCenter.errors.accountRequired");
      return;
    }
    if (selectedReport.needsVatPeriod && !periodId) {
      setErrorKey("reports.exportCenter.errors.periodRequired");
      return;
    }
    if (selectedReport.needsAsOf && !asOfDate) {
      setErrorKey("reports.exportCenter.errors.asOfRequired");
      return;
    }
    if (selectedReport.needsRange && selectedReport.rangeRequired && (!startDate || !endDate)) {
      setErrorKey("reports.exportCenter.errors.rangeRequired");
      return;
    }

    setErrorKey(null);
    const params = new URLSearchParams({ companyId: activeCompanyId, format });

    let endpoint = "";
    if (reportType === "profit-loss") {
      endpoint = "/api/reports/profit-loss/export";
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    } else if (reportType === "balance-sheet") {
      endpoint = "/api/reports/balance-sheet/export";
      params.set("asOfDate", asOfDate);
    } else if (reportType === "cash-flow") {
      endpoint = "/api/reports/cash-flow/export";
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    } else if (reportType === "trial-balance") {
      endpoint = "/api/reports/trial-balance/export";
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    } else if (reportType === "general-ledger") {
      endpoint = "/api/reports/general-ledger/export";
      params.set("accountId", accountId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    } else if (reportType === "vat") {
      endpoint = "/api/vat/report/export";
      params.set("periodId", periodId);
    }

    try {
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) {
        setErrorKey("reports.exportFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const extension = format === "pdf" ? "pdf" : format === "json" ? "json" : "csv";
      anchor.download = `${reportType}-export.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      loadExports();
    } catch {
      setErrorKey("reports.exportFailed");
    }
  };

  const buildHistoryExportUrl = (exportItem: ReportExport) => {
    if (!activeCompanyId) {
      return null;
    }
    const filters = exportItem.filters ?? {};
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      format: exportItem.format,
    });
    const getFilter = (key: string) => {
      const value = filters[key];
      return typeof value === "string" && value ? value : null;
    };
    switch (exportItem.reportType) {
      case "profit-loss": {
        const start = getFilter("startDate");
        const end = getFilter("endDate");
        const compareStart = getFilter("compareStartDate");
        const compareEnd = getFilter("compareEndDate");
        if (start) params.set("startDate", start);
        if (end) params.set("endDate", end);
        if (compareStart) params.set("compareStartDate", compareStart);
        if (compareEnd) params.set("compareEndDate", compareEnd);
        return `/api/reports/profit-loss/export?${params.toString()}`;
      }
      case "balance-sheet": {
        const asOfDate = getFilter("asOfDate");
        if (asOfDate) params.set("asOfDate", asOfDate);
        return `/api/reports/balance-sheet/export?${params.toString()}`;
      }
      case "cash-flow": {
        const start = getFilter("startDate");
        const end = getFilter("endDate");
        if (start) params.set("startDate", start);
        if (end) params.set("endDate", end);
        return `/api/reports/cash-flow/export?${params.toString()}`;
      }
      case "trial-balance": {
        const start = getFilter("startDate");
        const end = getFilter("endDate");
        if (start) params.set("startDate", start);
        if (end) params.set("endDate", end);
        return `/api/reports/trial-balance/export?${params.toString()}`;
      }
      case "general-ledger": {
        const start = getFilter("startDate");
        const end = getFilter("endDate");
        const accountIdValue = getFilter("accountId");
        if (!accountIdValue) {
          return null;
        }
        params.set("accountId", accountIdValue);
        if (start) params.set("startDate", start);
        if (end) params.set("endDate", end);
        return `/api/reports/general-ledger/export?${params.toString()}`;
      }
      case "vat": {
        const periodIdValue = getFilter("periodId");
        if (!periodIdValue) {
          return null;
        }
        params.set("periodId", periodIdValue);
        return `/api/vat/report/export?${params.toString()}`;
      }
      default:
        return null;
    }
  };

  const handleDownloadExport = async (exportItem: ReportExport) => {
    const endpoint = buildHistoryExportUrl(exportItem);
    if (!endpoint) {
      setErrorKey("reports.exportFailed");
      return;
    }
    setDownloadId(exportItem.id);
    setErrorKey(null);
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        setErrorKey("reports.exportFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const extension =
        exportItem.format === "pdf"
          ? "pdf"
          : exportItem.format === "json" || exportItem.format === "zatca"
            ? "json"
            : "csv";
      anchor.href = url;
      anchor.download = `${exportItem.reportType}-export.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorKey("reports.exportFailed");
    } finally {
      setDownloadId(null);
    }
  };

  const postingAccounts = useMemo(
    () =>
      accounts.filter((account) => account.isPosting && account.status === "active"),
    [accounts]
  );

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const getReportLabel = (type: string) => {
    const option = REPORT_OPTIONS.find((entry) => entry.value === type);
    return option ? t(option.labelKey) : type;
  };

  const formatFilters = (filters?: Record<string, unknown>) => {
    if (!filters || typeof filters !== "object") {
      return "-";
    }
    const parts: string[] = [];
    const start = typeof filters.startDate === "string" ? filters.startDate : "";
    const end = typeof filters.endDate === "string" ? filters.endDate : "";
    if (start || end) {
      parts.push(`${start || "-"} to ${end || "-"}`);
    }
    const asOfDateValue = typeof filters.asOfDate === "string" ? filters.asOfDate : "";
    if (asOfDateValue) {
      parts.push(`${t("reports.exportCenter.asOfDate")}: ${asOfDateValue}`);
    }
    const accountIdValue = typeof filters.accountId === "string" ? filters.accountId : "";
    if (accountIdValue) {
      const account = accountMap.get(accountIdValue);
      parts.push(
        `${t("reports.exportCenter.account")}: ${
          account ? `${account.code} - ${account.name}` : accountIdValue
        }`
      );
    }
    const periodNameValue =
      typeof filters.periodName === "string" ? filters.periodName : "";
    if (periodNameValue) {
      parts.push(`${t("reports.exportCenter.vatPeriod")}: ${periodNameValue}`);
    }
    return parts.length ? parts.join(" | ") : "-";
  };

  const handleApplyFilters = () => {
    loadExports();
  };

  const handleResetFilters = () => {
    const resetFilters = {
      reportType: "all",
      format: "all",
      userId: "all",
      startDate: "",
      endDate: "",
    };
    setFilterReportType(resetFilters.reportType);
    setFilterFormat(resetFilters.format);
    setFilterUserId(resetFilters.userId);
    setFilterStartDate(resetFilters.startDate);
    setFilterEndDate(resetFilters.endDate);
    loadExports(resetFilters);
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("reports.exportCenter.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("reports.exportCenter.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div>
          <h2 className="text-lg font-semibold">{t("reports.exportCenter.formTitle")}</h2>
          <p className="text-sm text-muted page-subtitle">{t("reports.exportCenter.formSubtitle")}</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.exportCenter.reportType")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={reportType}
              onChange={(event) => handleReportTypeChange(event.target.value)}
            >
              {REPORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.exportCenter.format")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              {selectedReport.formats.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {selectedReport.needsRange ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.startDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
          ) : null}
          {selectedReport.needsRange ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.endDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          ) : null}
          {selectedReport.needsAsOf ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.asOfDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
              />
            </label>
          ) : null}
          {selectedReport.needsAccount ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.account")}
              </span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">{t("reports.exportCenter.account")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selectedReport.needsVatPeriod ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.vatPeriod")}
              </span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={periodId}
                onChange={(event) => setPeriodId(event.target.value)}
              >
                <option value="">{t("reports.exportCenter.vatPeriod")}</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name} ({period.startDate} - {period.endDate})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("reports.exportCenter.exportButton")}
          </button>
          {errorKey ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {t(errorKey)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="app-card space-y-4 p-5 card-modern">
        <h2 className="text-lg font-semibold">{t("reports.exportCenter.historyTitle")}</h2>
        <div className="app-panel p-4">
          <p className="text-sm font-semibold">{t("reports.exportCenter.filtersTitle")}</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.filter.reportType")}
              </span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={filterReportType}
                onChange={(event) => setFilterReportType(event.target.value)}
              >
                <option value="all">{t("common.all")}</option>
                {REPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.filter.format")}
              </span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={filterFormat}
                onChange={(event) => setFilterFormat(event.target.value)}
              >
                <option value="all">{t("common.all")}</option>
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.filter.user")}
              </span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={filterUserId}
                onChange={(event) => setFilterUserId(event.target.value)}
              >
                <option value="all">{t("common.all")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.filter.startDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={filterStartDate}
                onChange={(event) => setFilterStartDate(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.exportCenter.filter.endDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={filterEndDate}
                onChange={(event) => setFilterEndDate(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApplyFilters}
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
            >
              {t("reports.exportCenter.filter.apply")}
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              {t("reports.exportCenter.filter.reset")}
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.exportCenter.exportTable.date")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.exportCenter.exportTable.report")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.exportCenter.exportTable.format")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.exportCenter.exportTable.user")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.exportCenter.exportTable.status")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.exportCenter.exportTable.filters")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("reports.exportCenter.exportTable.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td className="px-4 py-3 text-sm text-muted" colSpan={7}>
                      {t("reports.exportCenter.loading")}
                    </td>
                  </tr>
                ) : exports.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-sm text-muted" colSpan={7}>
                      {t("reports.exportCenter.empty")}
                    </td>
                  </tr>
                ) : (
                  exports.map((exportItem) => (
                    <tr key={exportItem.id}>
                      <td className="px-4 py-2">
                        {formatDateTime(exportItem.createdAt)}
                      </td>
                      <td className="px-4 py-2">{getReportLabel(exportItem.reportType)}</td>
                      <td className="px-4 py-2">{exportItem.format.toUpperCase()}</td>
                      <td className="px-4 py-2">{exportItem.userEmail ?? "-"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            exportItem.status === "failed"
                              ? "text-red-500"
                              : "text-emerald-600"
                          }
                        >
                          {exportItem.status === "failed"
                            ? t("reports.exportCenter.status.failed")
                            : t("reports.exportCenter.status.success")}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">
                        {formatFilters(exportItem.filters)}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadExport(exportItem)}
                          disabled={exportItem.status === "failed" || downloadId === exportItem.id}
                          className={`text-xs font-semibold ${
                            exportItem.status === "failed"
                              ? "text-muted"
                              : "text-foreground underline decoration-dotted"
                          }`}
                        >
                          {downloadId === exportItem.id
                            ? t("reports.exportCenter.downloading")
                            : t("reports.exportCenter.exportTable.download")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
