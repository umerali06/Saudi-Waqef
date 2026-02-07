"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";
import type { Role } from "@/lib/types";

const DAY_MS = 1000 * 60 * 60 * 24;
const REFRESH_MS = 5 * 60 * 1000;

type TrendValue = { delta: number; percent: number | null };

type AnalyticsOverview = {
  generatedAt: string;
  currency: string;
  range: {
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
    days: number;
  };
  accounting: {
    revenue: number;
    revenueTrend: TrendValue;
    expenses: number;
    expensesTrend: TrendValue;
    overdueCount: number;
    overdueAmount: number;
    cashBalance: number;
    netCashFlow: number;
  };
  vat: {
    outputVat: number;
    inputVat: number;
    netVat: number;
  };
  hr: {
    headcount: number;
    activeEmployees: number;
    absenteeismRate: number;
    payrollCost: number;
    leaveDays: number;
  };
  details: {
    overdueInvoices: Array<{
      id: string;
      invoiceNumber: string;
      customerId: string;
      customerName: string;
      dueDate: string;
      balance: number;
    }>;
    topCustomers: Array<{
      customerId: string;
      customerName: string;
      total: number;
      invoicesCount: number;
    }>;
    expenseCategories: Array<{
      categoryId: string;
      categoryName: string;
      total: number;
      count: number;
    }>;
  };
};

type CacheMeta = {
  cached: boolean;
  ageSeconds: number;
  ttlSeconds: number;
};

type DateRange = { startDate: string; endDate: string };

const buildDefaultRange = (): DateRange => {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - 30 * DAY_MS).toISOString().slice(0, 10);
  return { startDate, endDate };
};

const SkeletonBlock = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-xl bg-surface-muted ${className}`} />
);

export default function DashboardPage() {
  const { activeCompany, activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { formatCurrency, formatNumber, formatPercent, formatDate, formatDateTime } =
    useLocaleFormatters();
  const defaultRange = useMemo(() => buildDefaultRange(), []);
  const [filters, setFilters] = useState<DateRange>(defaultRange);
  const [appliedRange, setAppliedRange] = useState<DateRange>(defaultRange);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [cacheMeta, setCacheMeta] = useState<CacheMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const trendLabel = (trend?: TrendValue | null) => {
    if (!trend) {
      return "";
    }
    if (trend.percent === null) {
      return t("analytics.trend.noBaseline");
    }
    const value = formatNumber(Math.abs(trend.percent), { maximumFractionDigits: 1 });
    if (trend.percent > 0) {
      return t("analytics.trend.up", { value });
    }
    if (trend.percent < 0) {
      return t("analytics.trend.down", { value });
    }
    return t("analytics.trend.flat", { value });
  };

  const calcPreviousValue = (current: number, trend?: TrendValue | null) =>
    typeof trend?.delta === "number" ? current - trend.delta : 0;

  const loadOverview = async (nextRange = appliedRange, refresh = false) => {
    if (!activeCompanyId) {
      return;
    }
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams({
        companyId: activeCompanyId,
        startDate: nextRange.startDate,
        endDate: nextRange.endDate,
      });
      if (refresh) {
        params.set("refresh", "true");
      }
      const response = await fetch(`/api/analytics/overview?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        setErrorKey("analytics.error.loadFailed");
        return;
      }
      setOverview(data.overview ?? null);
      setRole(data.role ?? null);
      setCacheMeta(data.cache ?? null);
    } catch {
      setErrorKey("analytics.error.loadFailed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    loadOverview(appliedRange);
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    const intervalId = window.setInterval(() => {
      loadOverview(appliedRange);
    }, REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [activeCompanyId, appliedRange.startDate, appliedRange.endDate]);

  const canSeeAccounting = useMemo(() => {
    if (!role) {
      return false;
    }
    return ["owner", "admin", "accountant"].includes(role);
  }, [role]);

  const canSeeHr = useMemo(() => {
    if (!role) {
      return false;
    }
    return ["owner", "admin", "hr"].includes(role);
  }, [role]);

  const handleExport = () => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      startDate: appliedRange.startDate,
      endDate: appliedRange.endDate,
    });
    const link = document.createElement("a");
    link.href = `/api/analytics/export?${params.toString()}`;
    link.download = `analytics-${appliedRange.startDate}-to-${appliedRange.endDate}.csv`;
    link.click();
  };

  const cacheLabel = () => {
    if (!cacheMeta) {
      return t("analytics.cache.auto", { value: String(Math.round(REFRESH_MS / 60000)) });
    }
    const minutes = Math.max(1, Math.round(cacheMeta.ageSeconds / 60));
    return cacheMeta.cached
      ? t("analytics.cache.cached", { value: String(minutes) })
      : t("analytics.cache.fresh");
  };

  const renderComparisonBars = (current: number, previous: number) => {
    const max = Math.max(current, previous, 1);
    const currentWidth = `${(current / max) * 100}%`;
    const previousWidth = `${(previous / max) * 100}%`;
    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="w-16">{t("analytics.current")}</span>
          <div className="h-2 flex-1 rounded-full bg-surface-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: currentWidth }} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="w-16">{t("analytics.previous")}</span>
          <div className="h-2 flex-1 rounded-full bg-surface-muted">
            <div className="h-2 rounded-full bg-amber-400" style={{ width: previousWidth }} />
          </div>
        </div>
      </div>
    );
  };

  const renderBarList = (
    items: Array<{ label: string; value: number; hint?: string }>,
    formatter: (value: number) => string
  ) => {
    if (items.length === 0) {
      return <div className="text-sm text-muted">{t("analytics.table.empty")}</div>;
    }
    const max = Math.max(...items.map((item) => item.value), 1);
    return (
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="text-xs text-muted">{formatter(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-muted">
              <div
                className="h-2 rounded-full bg-primary/80"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
            {item.hint ? <p className="text-[11px] text-muted">{item.hint}</p> : null}
          </div>
        ))}
      </div>
    );
  };

  const showSkeleton = loading && !overview;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {showSkeleton ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-8 w-64" />
              <SkeletonBlock className="h-4 w-56" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted">{t("dashboard.title")}</p>
              <h1 className="text-2xl font-semibold">
                {activeCompany?.name ?? t("common.company")}
              </h1>
              <p className="text-sm text-muted">{t("analytics.subtitle")}</p>
            </>
          )}
        </div>
        <div className={`text-xs text-muted ${alignClass} space-y-1`}>
          {showSkeleton ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-36" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          ) : (
            <>
              <p>
                {overview
                  ? t("analytics.updatedAt", { value: formatDateTime(overview.generatedAt) })
                  : null}
              </p>
              <p>{cacheLabel()}</p>
            </>
          )}
        </div>
      </div>

      <div className="app-card p-4">
        {showSkeleton ? (
          <div className="flex flex-wrap items-end gap-4">
            <SkeletonBlock className="h-9 w-40" />
            <SkeletonBlock className="h-9 w-40" />
            <SkeletonBlock className="h-9 w-24" />
            <SkeletonBlock className="h-9 w-24" />
            <SkeletonBlock className="h-9 w-24" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <label className={`text-xs ${alignClass}`}>
                <span className="mb-1 block text-[11px] text-muted">
                  {t("analytics.filters.startDate")}
                </span>
                <input
                  type="date"
                  className="w-40 rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={filters.startDate}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </label>
              <label className={`text-xs ${alignClass}`}>
                <span className="mb-1 block text-[11px] text-muted">
                  {t("analytics.filters.endDate")}
                </span>
                <input
                  type="date"
                  className="w-40 rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={filters.endDate}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
                onClick={() => {
                  setAppliedRange(filters);
                  loadOverview(filters);
                }}
                disabled={loading}
              >
                {t("analytics.filters.apply")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
                onClick={() => loadOverview(appliedRange, true)}
                disabled={loading}
              >
                {t("analytics.refresh")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
                onClick={handleExport}
                disabled={loading}
              >
                {t("analytics.export")}
              </button>
            </div>
            {errorKey ? <p className="mt-2 text-xs text-red-500">{t(errorKey)}</p> : null}
          </>
        )}
      </div>

      {!overview && !loading ? (
        <div className="app-outline p-6 text-sm text-muted">{t("analytics.empty")}</div>
      ) : null}

      {overview ? (
        <div className="space-y-8">
          {canSeeAccounting ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{t("analytics.section.accounting")}</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.revenue")}</p>
                  <p className="text-xl font-semibold">{formatCurrency(overview.accounting.revenue)}</p>
                  <p className="mt-1 text-xs text-muted">{trendLabel(overview.accounting.revenueTrend)}</p>
                  {renderComparisonBars(
                    overview.accounting.revenue,
                    calcPreviousValue(overview.accounting.revenue, overview.accounting.revenueTrend)
                  )}
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.expenses")}</p>
                  <p className="text-xl font-semibold">{formatCurrency(overview.accounting.expenses)}</p>
                  <p className="mt-1 text-xs text-muted">{trendLabel(overview.accounting.expensesTrend)}</p>
                  {renderComparisonBars(
                    overview.accounting.expenses,
                    calcPreviousValue(overview.accounting.expenses, overview.accounting.expensesTrend)
                  )}
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.overdueInvoices")}</p>
                  <p className="text-xl font-semibold">{formatNumber(overview.accounting.overdueCount)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {t("analytics.kpi.overdueAmount")}:{" "}
                    {formatCurrency(overview.accounting.overdueAmount, overview.currency)}
                  </p>
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.cashBalance")}</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(overview.accounting.cashBalance, overview.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t("analytics.kpi.netCashFlow")}:{" "}
                    {formatCurrency(overview.accounting.netCashFlow, overview.currency)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {canSeeAccounting ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{t("analytics.section.vat")}</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.vatOutput")}</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(overview.vat.outputVat, overview.currency)}
                  </p>
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.vatInput")}</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(overview.vat.inputVat, overview.currency)}
                  </p>
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.vatNet")}</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(overview.vat.netVat, overview.currency)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {canSeeHr ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{t("analytics.section.hr")}</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.headcount")}</p>
                  <p className="text-xl font-semibold">{formatNumber(overview.hr.headcount)}</p>
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.activeEmployees")}</p>
                  <p className="text-xl font-semibold">{formatNumber(overview.hr.activeEmployees)}</p>
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.absenteeism")}</p>
                  <p className="text-xl font-semibold">
                    {formatPercent(overview.hr.absenteeismRate)}
                  </p>
                </div>
                <div className="app-panel p-4">
                  <p className="text-xs text-muted">{t("analytics.kpi.payrollCost")}</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(overview.hr.payrollCost, overview.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t("analytics.kpi.leaveDays")}:{" "}
                    {formatNumber(overview.hr.leaveDays, { maximumFractionDigits: 1 })}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {canSeeAccounting ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="app-card p-4">
                <h3 className="text-sm font-semibold">{t("analytics.table.topCustomers")}</h3>
                <div className="mt-3">
                  {renderBarList(
                    overview.details.topCustomers.map((customer) => ({
                      label: customer.customerName,
                      value: customer.total,
                      hint: t("analytics.table.invoices", { value: String(customer.invoicesCount) }),
                    })),
                    (value) => formatCurrency(value, overview.currency)
                  )}
                </div>
              </div>
              <div className="app-card p-4">
                <h3 className="text-sm font-semibold">{t("analytics.table.expenseCategories")}</h3>
                <div className="mt-3">
                  {renderBarList(
                    overview.details.expenseCategories.map((category) => ({
                      label: category.categoryName,
                      value: category.total,
                      hint: t("analytics.table.records", { value: String(category.count) }),
                    })),
                    (value) => formatCurrency(value, overview.currency)
                  )}
                </div>
              </div>
              <div className="app-card p-4">
                <h3 className="text-sm font-semibold">{t("analytics.table.overdueTitle")}</h3>
                {overview.details.overdueInvoices.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">{t("analytics.table.overdueEmpty")}</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-xs text-muted">
                        <tr>
                          <th className={`px-2 py-1 ${alignClass}`}>
                            {t("analytics.table.invoice")}
                          </th>
                          <th className={`px-2 py-1 ${alignClass}`}>
                            {t("analytics.table.customer")}
                          </th>
                          <th className={`px-2 py-1 ${alignClass}`}>
                            {t("analytics.table.dueDate")}
                          </th>
                          <th className={`px-2 py-1 ${alignClass}`}>
                            {t("analytics.table.balance")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {overview.details.overdueInvoices.map((invoice) => (
                          <tr key={invoice.id}>
                            <td className="px-2 py-2 font-medium">
                              <Link
                                href={`/sales/invoices/${invoice.id}`}
                                className="text-primary hover:underline"
                              >
                                {invoice.invoiceNumber}
                              </Link>
                            </td>
                            <td className="px-2 py-2">
                              <Link
                                href={`/sales/customers/${invoice.customerId}`}
                                className="text-foreground hover:text-primary"
                              >
                                {invoice.customerName}
                              </Link>
                            </td>
                            <td className="px-2 py-2 text-xs text-muted">
                              {formatDate(invoice.dueDate)}
                            </td>
                            <td className="px-2 py-2 text-xs text-muted">
                              {formatCurrency(invoice.balance, overview.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t("analytics.quickLinks")}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Link
                href="/sales/invoices"
                className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {t("analytics.link.sales")}
              </Link>
              <Link
                href="/purchases/expenses"
                className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {t("analytics.link.expenses")}
              </Link>
              <Link
                href="/hr/payroll"
                className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {t("analytics.link.payroll")}
              </Link>
              <Link
                href="/reports/vat"
                className="app-card p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {t("analytics.link.vat")}
              </Link>
            </div>
          </div>
        </div>
      ) : showSkeleton ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="app-panel space-y-3 p-4">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-7 w-32" />
                <SkeletonBlock className="h-3 w-40" />
                <SkeletonBlock className="h-2 w-full" />
                <SkeletonBlock className="h-2 w-5/6" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="app-panel space-y-3 p-4">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-7 w-32" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="app-card space-y-3 p-4">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-5/6" />
                <SkeletonBlock className="h-3 w-4/6" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
