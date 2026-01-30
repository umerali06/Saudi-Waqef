"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";
import { HelpLink } from "@/components/help-link";

type VatPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  frequency: "monthly" | "quarterly";
  status: "open" | "filed";
  filedAt?: string | null;
};

type VatBreakdownEntry = {
  rate: number;
  type: "standard" | "zero" | "exempt" | "other";
  taxableAmount: number;
  taxAmount: number;
};

type VatSummary = {
  startDate: string;
  endDate: string;
  sales: { netAmount: number; taxAmount: number; totalAmount: number };
  purchases: { netAmount: number; taxAmount: number; totalAmount: number };
  adjustments: { output: number; input: number; net: number };
  outputVat: number;
  inputVat: number;
  netVat: number;
  breakdown: { sales: VatBreakdownEntry[]; purchases: VatBreakdownEntry[] };
};

type VatAdjustment = {
  id: string;
  type: "output" | "input";
  amount: number;
  reason: string;
  createdAt: string;
};

const EMPTY_PERIOD: { name: string; startDate: string; endDate: string; frequency: "monthly" | "quarterly" } = {
  name: "",
  startDate: "",
  endDate: "",
  frequency: "monthly",
};

export default function VatReportsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { formatNumber, formatDate, formatPercent } = useLocaleFormatters();
  const [periods, setPeriods] = useState<VatPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [summary, setSummary] = useState<VatSummary | null>(null);
  const [adjustments, setAdjustments] = useState<VatAdjustment[]>([]);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [newPeriod, setNewPeriod] = useState(EMPTY_PERIOD);
  const [adjustmentType, setAdjustmentType] = useState<"output" | "input">("output");
  const [adjustmentAmount, setAdjustmentAmount] = useState("0");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );

  const loadBase = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    Promise.all([
      fetch(`/api/vat/periods?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
    ])
      .then(([periodData, configData]) => {
        const nextPeriods = periodData.periods ?? [];
        setPeriods(nextPeriods);
        const vatFrequency =
          configData?.config?.vatFilingFrequency === "monthly" ? "monthly" : "quarterly";
        setFrequency(vatFrequency);
        setNewPeriod((prev) => ({ ...prev, frequency: vatFrequency }));
        setVatEnabled(Boolean(configData?.config?.vatEnabled));
        if (!selectedPeriodId && nextPeriods.length > 0) {
          setSelectedPeriodId(nextPeriods[nextPeriods.length - 1].id);
        }
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId, selectedPeriodId]);

  const loadSummary = useCallback(() => {
    if (!activeCompanyId || !selectedPeriodId) {
      setSummary(null);
      setAdjustments([]);
      return;
    }
    Promise.all([
      fetch(
        `/api/vat/report?companyId=${activeCompanyId}&periodId=${selectedPeriodId}`
      ).then((res) => res.json()),
      fetch(
        `/api/vat/adjustments?companyId=${activeCompanyId}&periodId=${selectedPeriodId}`
      ).then((res) => res.json()),
    ])
      .then(([summaryData, adjustmentData]) => {
        setSummary(summaryData.summary ?? null);
        setAdjustments(adjustmentData.adjustments ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId, selectedPeriodId]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleGenerate = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/vat/periods/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          year,
          frequency,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapVatError(data?.error));
        return;
      }
      loadBase();
    });
  };

  const handleCreatePeriod = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/vat/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          ...newPeriod,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapVatError(data?.error));
        return;
      }
      setNewPeriod((prev) => ({ ...prev, name: "", startDate: "", endDate: "" }));
      loadBase();
    });
  };

  const handleToggleStatus = (periodId: string, status: "open" | "filed") => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/vat/periods/${periodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          status,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      loadBase();
      if (periodId === selectedPeriodId) {
        loadSummary();
      }
    });
  };

  const handleAddAdjustment = () => {
    if (!activeCompanyId || !selectedPeriodId) {
      return;
    }
    if (!adjustmentReason.trim()) {
      setErrorKey("reports.vat.adjustmentReasonRequired");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/vat/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          periodId: selectedPeriodId,
          type: adjustmentType,
          amount: Number(adjustmentAmount) || 0,
          reason: adjustmentReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapVatError(data?.error));
        return;
      }
      setAdjustmentAmount("0");
      setAdjustmentReason("");
      loadSummary();
    });
  };

  const handleExport = async (format: "csv" | "pdf" | "zatca") => {
    if (!activeCompanyId || !selectedPeriodId) {
      return;
    }
    const response = await fetch(
      `/api/vat/report/export?companyId=${activeCompanyId}&periodId=${selectedPeriodId}&format=${format}`
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setErrorKey(mapVatError(data?.error));
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const extension = format === "pdf" ? "pdf" : format === "zatca" ? "json" : "csv";
    link.href = url;
    link.download = `vat-report.${extension}`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const mapVatError = (error?: string) => {
    switch (error) {
      case "VAT period overlaps an existing period":
        return "reports.vat.overlap";
      case "Invalid date range":
        return "reports.vat.invalidRange";
      case "VAT period is filed":
        return "vat.periodLocked";
      default:
        return "error.saveFailed";
    }
  };

  const formatAmount = (value: number) =>
    formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("reports.vat.title")}</h1>
          <p className="text-sm text-muted">{t("reports.vat.subtitle")}</p>
        </div>
        <HelpLink query="vat" />
      </div>

      {!vatEnabled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {t("reports.vat.disabled")}
        </div>
      ) : null}

      <div className="app-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.vat.period")}
            </span>
            <select
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={selectedPeriodId}
              onChange={(event) => setSelectedPeriodId(event.target.value)}
            >
              <option value="">{t("reports.vat.periodPlaceholder")}</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name} ({formatDate(period.startDate)} - {formatDate(period.endDate)})
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {selectedPeriod ? (
              <span className="text-xs text-muted">
                {selectedPeriod.status === "filed"
                  ? t("reports.vat.status.filed")
                  : t("reports.vat.status.open")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() =>
                selectedPeriod
                  ? handleToggleStatus(
                      selectedPeriod.id,
                      selectedPeriod.status === "open" ? "filed" : "open"
                    )
                  : null
              }
              disabled={!selectedPeriod || isPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {selectedPeriod?.status === "open"
                ? t("reports.vat.file")
                : t("reports.vat.reopen")}
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={!selectedPeriodId}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("reports.vat.exportCsv")}
            </button>
            <button
              type="button"
              onClick={() => handleExport("zatca")}
              disabled={!selectedPeriodId}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("reports.vat.exportZatca")}
            </button>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={!selectedPeriodId}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("reports.vat.exportPdf")}
            </button>
          </div>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
      </div>

      {summary ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.vat.outputVat")}</p>
            <p className="text-xl font-semibold">{formatAmount(summary.outputVat)}</p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.vat.inputVat")}</p>
            <p className="text-xl font-semibold">{formatAmount(summary.inputVat)}</p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.vat.netVat")}</p>
            <p className="text-xl font-semibold">{formatAmount(summary.netVat)}</p>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="app-card p-4">
            <h2 className="text-sm font-semibold">{t("reports.vat.sales")}</h2>
            <div className="mt-3 space-y-1 text-sm text-muted">
              <p>
                {t("reports.vat.taxable")}: {formatAmount(summary.sales.netAmount)}
              </p>
              <p>
                {t("reports.vat.tax")}: {formatAmount(summary.sales.taxAmount)}
              </p>
              <p>
                {t("reports.vat.total")}: {formatAmount(summary.sales.totalAmount)}
              </p>
            </div>
          </div>
          <div className="app-card p-4">
            <h2 className="text-sm font-semibold">{t("reports.vat.purchases")}</h2>
            <div className="mt-3 space-y-1 text-sm text-muted">
              <p>
                {t("reports.vat.taxable")}: {formatAmount(summary.purchases.netAmount)}
              </p>
              <p>
                {t("reports.vat.tax")}: {formatAmount(summary.purchases.taxAmount)}
              </p>
              <p>
                {t("reports.vat.total")}: {formatAmount(summary.purchases.totalAmount)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="app-card overflow-hidden">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">
              {t("reports.vat.breakdownSales")}
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.rate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.type")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.taxable")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.tax")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.breakdown.sales.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-sm text-muted" colSpan={4}>
                      {t("reports.vat.emptyBreakdown")}
                    </td>
                  </tr>
                ) : (
                  summary.breakdown.sales.map((entry) => (
                    <tr key={`sales-${entry.rate}-${entry.type}`}>
                      <td className="px-4 py-2">{formatPercent(entry.rate / 100, 2)}</td>
                      <td className="px-4 py-2">{t(`reports.vat.type.${entry.type}`)}</td>
                      <td className="px-4 py-2">{formatAmount(entry.taxableAmount)}</td>
                      <td className="px-4 py-2">{formatAmount(entry.taxAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="app-card overflow-hidden">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">
              {t("reports.vat.breakdownPurchases")}
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.rate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.type")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.taxable")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.tax")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.breakdown.purchases.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-sm text-muted" colSpan={4}>
                      {t("reports.vat.emptyBreakdown")}
                    </td>
                  </tr>
                ) : (
                  summary.breakdown.purchases.map((entry) => (
                    <tr key={`purchases-${entry.rate}-${entry.type}`}>
                      <td className="px-4 py-2">{formatPercent(entry.rate / 100, 2)}</td>
                      <td className="px-4 py-2">{t(`reports.vat.type.${entry.type}`)}</td>
                      <td className="px-4 py-2">{formatAmount(entry.taxableAmount)}</td>
                      <td className="px-4 py-2">{formatAmount(entry.taxAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("reports.vat.adjustmentsTitle")}</h2>
        <p className="text-sm text-muted">{t("reports.vat.adjustmentsSubtitle")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.vat.adjustmentType")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={adjustmentType}
              onChange={(event) =>
                setAdjustmentType(event.target.value as "output" | "input")
              }
            >
              <option value="output">{t("reports.vat.adjustmentOutput")}</option>
              <option value="input">{t("reports.vat.adjustmentInput")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.vat.adjustmentAmount")}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
            />
          </label>
          <label className={`text-sm md:col-span-2 ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.vat.adjustmentReason")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddAdjustment}
            disabled={!selectedPeriodId || isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("reports.vat.addAdjustment")}
          </button>
          {errorKey ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {t(errorKey)}
            </div>
          ) : null}
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-muted text-muted">
              <tr>
                <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.adjustmentType")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.adjustmentReason")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.adjustmentAmount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {adjustments.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sm text-muted" colSpan={3}>
                    {t("reports.vat.adjustmentsEmpty")}
                  </td>
                </tr>
              ) : (
                adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td className="px-4 py-2">
                      {adjustment.type === "output"
                        ? t("reports.vat.adjustmentOutput")
                        : t("reports.vat.adjustmentInput")}
                    </td>
                    <td className="px-4 py-2">{adjustment.reason}</td>
                    <td className="px-4 py-2">{formatAmount(adjustment.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-5">
          <h2 className="text-lg font-semibold">{t("reports.vat.generateTitle")}</h2>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.vat.year")}
              </span>
              <input
                type="number"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.vat.frequency")}
              </span>
              <select
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as "monthly" | "quarterly")
                }
              >
                <option value="monthly">{t("reports.vat.monthly")}</option>
                <option value="quarterly">{t("reports.vat.quarterly")}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
              disabled={isPending}
            >
              {t("reports.vat.generate")}
            </button>
          </div>
        </div>

        <form onSubmit={handleCreatePeriod} className="app-card p-5">
          <h2 className="text-lg font-semibold">{t("reports.vat.createTitle")}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("reports.vat.name")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={newPeriod.name}
                onChange={(event) =>
                  setNewPeriod((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.vat.startDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={newPeriod.startDate}
                onChange={(event) =>
                  setNewPeriod((prev) => ({ ...prev, startDate: event.target.value }))
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.vat.endDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={newPeriod.endDate}
                onChange={(event) =>
                  setNewPeriod((prev) => ({ ...prev, endDate: event.target.value }))
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("reports.vat.frequency")}
              </span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={newPeriod.frequency}
                onChange={(event) =>
                  setNewPeriod((prev) => ({
                    ...prev,
                    frequency: event.target.value as "monthly" | "quarterly",
                  }))
                }
              >
                <option value="monthly">{t("reports.vat.monthly")}</option>
                <option value="quarterly">{t("reports.vat.quarterly")}</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("reports.vat.create")}
          </button>
        </form>
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("reports.vat.periodsTitle")}
        </div>
        {periods.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("reports.vat.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.startDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.endDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.vat.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {periods.map((period) => (
                  <tr key={period.id}>
                    <td className="px-4 py-2">{period.name}</td>
                    <td className="px-4 py-2">{formatDate(period.startDate)}</td>
                    <td className="px-4 py-2">{formatDate(period.endDate)}</td>
                    <td className="px-4 py-2">
                      {period.status === "open"
                        ? t("reports.vat.status.open")
                        : t("reports.vat.status.filed")}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          className="font-semibold text-primary"
                          onClick={() => setSelectedPeriodId(period.id)}
                        >
                          {t("reports.vat.view")}
                        </button>
                        <button
                          type="button"
                          className="font-semibold text-muted"
                          onClick={() =>
                            handleToggleStatus(
                              period.id,
                              period.status === "open" ? "filed" : "open"
                            )
                          }
                        >
                          {period.status === "open"
                            ? t("reports.vat.file")
                            : t("reports.vat.reopen")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
