"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type Department = {
  id: string;
  nameAr: string;
  nameEn: string;
};

type HrReport = {
  range: { startDate: string; endDate: string };
  kpis: {
    headcount: number;
    activeEmployees: number;
    absenteeismRate: number;
    overtimeHours: number;
    payrollCost: number;
    leaveDays: number;
  };
  employees: {
    byDepartment: Array<{ id: string; nameAr: string; nameEn: string; count: number }>;
    byPosition: Array<{ id: string; nameAr: string; nameEn: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    hires: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      hireDate: string | null;
      departmentId: string | null;
      positionId: string | null;
    }>;
    terminations: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      terminationDate: string | null;
      departmentId: string | null;
      positionId: string | null;
    }>;
  };
  attendance: {
    byEmployee: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      departmentId: string | null;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      leaveDays: number;
      overtimeMinutes: number;
      lateMinutes: number;
    }>;
    byDepartment: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      leaveDays: number;
      overtimeMinutes: number;
    }>;
  };
  leave: {
    balances: Array<{
      employeeId: string;
      nameAr: string;
      nameEn: string;
      leaveTypeId: string;
      leaveTypeName: string;
      allowance: number;
      adjustments: number;
      used: number;
      remaining: number;
    }>;
    usageByType: Array<{ leaveTypeId: string; leaveTypeName: string; used: number }>;
    pendingRequests: Array<{
      id: string;
      employeeId: string;
      nameAr: string;
      nameEn: string;
      leaveTypeId: string;
      leaveTypeName: string;
      startDate: string;
      endDate: string;
      days: number;
      status: string;
    }>;
  };
  payroll: {
    currentRun: {
      id: string;
      periodStart: string;
      periodEnd: string;
      status: string;
      totals: { grossPay: number; totalDeductions: number; netPay: number };
    } | null;
    previousRun: {
      id: string;
      periodStart: string;
      periodEnd: string;
      totals: { grossPay: number; totalDeductions: number; netPay: number };
    } | null;
    variance: { gross: number; deductions: number; net: number } | null;
    byDepartment: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      grossPay: number;
      totalDeductions: number;
      netPay: number;
      employeeCount: number;
    }>;
    netDistribution: Array<{ range: string; count: number; total: number }>;
  };
};

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

const getDefaultRange = () => {
  const today = new Date();
  const endDate = formatDate(today);
  const startDate = formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
  return { startDate, endDate };
};

export default function HrReportsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [startDate, setStartDate] = useState(() => getDefaultRange().startDate);
  const [endDate, setEndDate] = useState(() => getDefaultRange().endDate);
  const [departmentId, setDepartmentId] = useState("all");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [report, setReport] = useState<HrReport | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
      }),
    [locale]
  );

  const formatDisplayDate = useCallback(
    (value?: string | null) => {
      if (!value) {
        return "-";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return formatter.format(date);
    },
    [formatter]
  );

  const loadDepartments = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/departments?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments ?? []))
      .catch(() => setDepartments([]));
  }, [activeCompanyId]);

  const loadReport = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoading(true);
    setErrorKey(null);
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      startDate,
      endDate,
    });
    if (departmentId !== "all") {
      params.set("departmentId", departmentId);
    }
    fetch(`/api/hr/reports/summary?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setReport(data.report ?? null))
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoading(false));
  }, [activeCompanyId, startDate, endDate, departmentId]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const displayName = (entry: { nameAr: string; nameEn: string }) =>
    locale === "ar" ? entry.nameAr : entry.nameEn;

  const departmentLookup = useMemo(() => {
    const map = new Map<string, Department>();
    departments.forEach((department) => map.set(department.id, department));
    return map;
  }, [departments]);

  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const escapeValue = (value: string) => {
      const needsQuotes = value.includes(",") || value.includes("\"") || value.includes("\n");
      const escaped = value.replace(/\"/g, "\"\"");
      return needsQuotes ? `"${escaped}"` : escaped;
    };
    const csvLines = [
      headers.map(escapeValue).join(","),
      ...rows.map((row) => row.map((cell) => escapeValue(cell)).join(",")),
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdfSummary = () => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      startDate,
      endDate,
      report: "summary",
      format: "pdf",
    });
    if (departmentId !== "all") {
      params.set("departmentId", departmentId);
    }
    fetch(`/api/hr/reports/export?${params.toString()}`)
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `hr-summary-${startDate}-${endDate}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setErrorKey("error.loadFailed"));
  };

  if (!report && loading) {
    return (
      <section className="space-y-6">
        <div>
          <SkeletonBlock className="h-6 w-48" />
          <SkeletonBlock className="mt-2 h-4 w-72" />
        </div>
        <div className="app-card p-5">
          <SkeletonBlock className="h-4 w-40" />
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="app-card p-4">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-3 h-6 w-20" />
            </div>
          ))}
        </div>
        <div className="app-card p-5 space-y-3">
          <SkeletonBlock className="h-4 w-48" />
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-10 w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("hr.reports.title")}</h1>
        <p className="text-sm text-muted">{t("hr.reports.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("hr.reports.filtersTitle")}</h2>
            <p className="text-xs text-muted">{t("hr.reports.filtersSubtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground"
              onClick={downloadPdfSummary}
            >
              {t("hr.reports.exportPdf")}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.reports.startDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.reports.endDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.reports.department")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {displayName(department)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast"
            onClick={loadReport}
            disabled={loading}
          >
            {t("hr.reports.applyFilters")}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground"
            onClick={() => {
              const range = getDefaultRange();
              setStartDate(range.startDate);
              setEndDate(range.endDate);
              setDepartmentId("all");
              setTimeout(() => loadReport(), 0);
            }}
          >
            {t("hr.reports.resetFilters")}
          </button>
        </div>
      </div>

      {report ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="app-card p-4">
              <p className="text-xs text-muted">{t("hr.reports.kpi.headcount")}</p>
              <p className="text-2xl font-semibold">{report.kpis.headcount}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-muted">{t("hr.reports.kpi.active")}</p>
              <p className="text-2xl font-semibold">{report.kpis.activeEmployees}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-muted">{t("hr.reports.kpi.absenteeism")}</p>
              <p className="text-2xl font-semibold">
                {(report.kpis.absenteeismRate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-muted">{t("hr.reports.kpi.overtime")}</p>
              <p className="text-2xl font-semibold">{report.kpis.overtimeHours.toFixed(2)}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-muted">{t("hr.reports.kpi.leaveDays")}</p>
              <p className="text-2xl font-semibold">{report.kpis.leaveDays.toFixed(1)}</p>
            </div>
            <div className="app-card p-4">
              <p className="text-xs text-muted">{t("hr.reports.kpi.payrollCost")}</p>
              <p className="text-2xl font-semibold">{report.kpis.payrollCost.toFixed(2)}</p>
            </div>
          </div>

          <div className="app-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("hr.reports.employees.title")}</h2>
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-foreground"
                onClick={() =>
                  downloadCsv(
                    `hr-employees-${report.range.startDate}-${report.range.endDate}.csv`,
                    [t("hr.reports.employees.department"), t("hr.reports.employees.count")],
                    report.employees.byDepartment.map((entry) => [
                      displayName(entry),
                      String(entry.count),
                    ])
                  )
                }
              >
                {t("hr.reports.exportCsv")}
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  {t("hr.reports.employees.byDepartment")}
                </h3>
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.department")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.count")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.employees.byDepartment.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">{displayName(entry)}</td>
                        <td className="px-2 py-1">{entry.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  {t("hr.reports.employees.byPosition")}
                </h3>
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.position")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.count")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.employees.byPosition.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">{displayName(entry)}</td>
                        <td className="px-2 py-1">{entry.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  {t("hr.reports.employees.byStatus")}
                </h3>
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.status")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.count")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.employees.byStatus.map((entry) => (
                      <tr key={entry.status}>
                        <td className="px-2 py-1">{t(`hr.reports.status.${entry.status}`)}</td>
                        <td className="px-2 py-1">{entry.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  {t("hr.reports.employees.hires")}
                </h3>
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.employee")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.date")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.department")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.employees.hires.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">
                          {locale === "ar" ? entry.nameAr : entry.nameEn}
                        </td>
                        <td className="px-2 py-1">{formatDisplayDate(entry.hireDate)}</td>
                        <td className="px-2 py-1">
                          {entry.departmentId
                            ? displayName(
                                departmentLookup.get(entry.departmentId) ?? {
                                  nameAr: t("common.na"),
                                  nameEn: t("common.na"),
                                }
                              )
                            : t("hr.reports.unassigned")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  {t("hr.reports.employees.terminations")}
                </h3>
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.employee")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.date")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.employees.department")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.employees.terminations.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">
                          {locale === "ar" ? entry.nameAr : entry.nameEn}
                        </td>
                        <td className="px-2 py-1">{formatDisplayDate(entry.terminationDate)}</td>
                        <td className="px-2 py-1">
                          {entry.departmentId
                            ? displayName(
                                departmentLookup.get(entry.departmentId) ?? {
                                  nameAr: t("common.na"),
                                  nameEn: t("common.na"),
                                }
                              )
                            : t("hr.reports.unassigned")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="app-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("hr.reports.attendance.title")}</h2>
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-foreground"
                onClick={() =>
                  downloadCsv(
                    `hr-attendance-${report.range.startDate}-${report.range.endDate}.csv`,
                    [
                      t("hr.reports.attendance.employee"),
                      t("hr.reports.attendance.presentDays"),
                      t("hr.reports.attendance.lateDays"),
                      t("hr.reports.attendance.absentDays"),
                      t("hr.reports.attendance.leaveDays"),
                      t("hr.reports.attendance.overtimeMinutes"),
                      t("hr.reports.attendance.lateMinutes"),
                    ],
                    report.attendance.byEmployee.map((entry) => [
                      locale === "ar" ? entry.nameAr : entry.nameEn,
                      String(entry.presentDays),
                      String(entry.lateDays),
                      String(entry.absentDays),
                      String(entry.leaveDays),
                      String(entry.overtimeMinutes),
                      String(entry.lateMinutes),
                    ])
                  )
                }
              >
                {t("hr.reports.exportCsv")}
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  {t("hr.reports.attendance.byEmployee")}
                </h3>
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.employee")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.presentDays")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.lateDays")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.absentDays")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.attendance.byEmployee.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">
                          {locale === "ar" ? entry.nameAr : entry.nameEn}
                        </td>
                        <td className="px-2 py-1">{entry.presentDays}</td>
                        <td className="px-2 py-1">{entry.lateDays}</td>
                        <td className="px-2 py-1">{entry.absentDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  {t("hr.reports.attendance.byDepartment")}
                </h3>
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.department")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.presentDays")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.absentDays")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.attendance.overtimeMinutes")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.attendance.byDepartment.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">{displayName(entry)}</td>
                        <td className="px-2 py-1">{entry.presentDays}</td>
                        <td className="px-2 py-1">{entry.absentDays}</td>
                        <td className="px-2 py-1">{entry.overtimeMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="app-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("hr.reports.leave.title")}</h2>
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-foreground"
                onClick={() =>
                  downloadCsv(
                    `hr-leave-${report.range.startDate}-${report.range.endDate}.csv`,
                    [
                      t("hr.reports.leave.employee"),
                      t("hr.reports.leave.type"),
                      t("hr.reports.leave.allowance"),
                      t("hr.reports.leave.adjustments"),
                      t("hr.reports.leave.used"),
                      t("hr.reports.leave.remaining"),
                    ],
                    report.leave.balances.map((entry) => [
                      locale === "ar" ? entry.nameAr : entry.nameEn,
                      entry.leaveTypeName,
                      entry.allowance.toFixed(2),
                      entry.adjustments.toFixed(2),
                      entry.used.toFixed(2),
                      entry.remaining.toFixed(2),
                    ])
                  )
                }
              >
                {t("hr.reports.exportCsv")}
              </button>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-muted">
                {t("hr.reports.leave.balances")}
              </h3>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.leave.employee")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.leave.type")}</th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.leave.allowance")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.leave.adjustments")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.leave.used")}</th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.leave.remaining")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.leave.balances.map((entry) => (
                      <tr key={`${entry.employeeId}-${entry.leaveTypeId}`}>
                        <td className="px-2 py-1">
                          {locale === "ar" ? entry.nameAr : entry.nameEn}
                        </td>
                        <td className="px-2 py-1">{entry.leaveTypeName}</td>
                        <td className="px-2 py-1">{entry.allowance.toFixed(2)}</td>
                        <td className="px-2 py-1">{entry.adjustments.toFixed(2)}</td>
                        <td className="px-2 py-1">{entry.used.toFixed(2)}</td>
                        <td className="px-2 py-1">{entry.remaining.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted">
                {t("hr.reports.leave.pendingRequests")}
              </h3>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.leave.employee")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.leave.type")}</th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.leave.startDate")}</th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.leave.endDate")}</th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.leave.days")}</th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.leave.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.leave.pendingRequests.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">
                          {locale === "ar" ? entry.nameAr : entry.nameEn}
                        </td>
                        <td className="px-2 py-1">{entry.leaveTypeName}</td>
                        <td className="px-2 py-1">{formatDisplayDate(entry.startDate)}</td>
                        <td className="px-2 py-1">{formatDisplayDate(entry.endDate)}</td>
                        <td className="px-2 py-1">{entry.days}</td>
                        <td className="px-2 py-1">
                          {t(`hr.reports.leaveStatus.${entry.status}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="app-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("hr.reports.payroll.title")}</h2>
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-foreground"
                onClick={() =>
                  downloadCsv(
                    `hr-payroll-${report.range.startDate}-${report.range.endDate}.csv`,
                    [
                      t("hr.reports.payroll.department"),
                      t("hr.reports.payroll.employees"),
                      t("hr.reports.payroll.gross"),
                      t("hr.reports.payroll.deductions"),
                      t("hr.reports.payroll.net"),
                    ],
                    report.payroll.byDepartment.map((entry) => [
                      displayName(entry),
                      String(entry.employeeCount),
                      entry.grossPay.toFixed(2),
                      entry.totalDeductions.toFixed(2),
                      entry.netPay.toFixed(2),
                    ])
                  )
                }
              >
                {t("hr.reports.exportCsv")}
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface px-4 py-3">
                <p className="text-xs text-muted">{t("hr.reports.payroll.currentRun")}</p>
                {report.payroll.currentRun ? (
                  <>
                    <p className="text-sm font-semibold">
                      {formatDisplayDate(report.payroll.currentRun.periodStart)} -{" "}
                      {formatDisplayDate(report.payroll.currentRun.periodEnd)}
                    </p>
                    <p className="text-xs text-muted">
                      {t("hr.reports.payroll.status")}: {report.payroll.currentRun.status}
                    </p>
                    <div className="mt-2 text-xs text-muted">
                      <div>
                        {t("hr.reports.payroll.gross")}: {report.payroll.currentRun.totals.grossPay.toFixed(2)}
                      </div>
                      <div>
                        {t("hr.reports.payroll.deductions")}: {report.payroll.currentRun.totals.totalDeductions.toFixed(2)}
                      </div>
                      <div>
                        {t("hr.reports.payroll.net")}: {report.payroll.currentRun.totals.netPay.toFixed(2)}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted">{t("hr.reports.payroll.noRun")}</p>
                )}
              </div>
              <div className="rounded-xl border border-border bg-surface px-4 py-3">
                <p className="text-xs text-muted">{t("hr.reports.payroll.varianceTitle")}</p>
                {report.payroll.variance ? (
                  <div className="mt-2 text-xs text-muted">
                    <div>
                      {t("hr.reports.payroll.varianceGross")}: {report.payroll.variance.gross.toFixed(2)}
                    </div>
                    <div>
                      {t("hr.reports.payroll.varianceDeductions")}: {report.payroll.variance.deductions.toFixed(2)}
                    </div>
                    <div>
                      {t("hr.reports.payroll.varianceNet")}: {report.payroll.variance.net.toFixed(2)}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t("hr.reports.payroll.noVariance")}</p>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted">
                {t("hr.reports.payroll.byDepartment")}
              </h3>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.payroll.department")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.payroll.employees")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.payroll.gross")}</th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.payroll.deductions")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.payroll.net")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.payroll.byDepartment.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-2 py-1">{displayName(entry)}</td>
                        <td className="px-2 py-1">{entry.employeeCount}</td>
                        <td className="px-2 py-1">{entry.grossPay.toFixed(2)}</td>
                        <td className="px-2 py-1">{entry.totalDeductions.toFixed(2)}</td>
                        <td className="px-2 py-1">{entry.netPay.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted">
                {t("hr.reports.payroll.distribution")}
              </h3>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.payroll.range")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>
                        {t("hr.reports.payroll.employees")}
                      </th>
                      <th className={`px-2 py-1 ${alignClass}`}>{t("hr.reports.payroll.total")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.payroll.netDistribution.map((entry) => (
                      <tr key={entry.range}>
                        <td className="px-2 py-1">{entry.range}</td>
                        <td className="px-2 py-1">{entry.count}</td>
                        <td className="px-2 py-1">{entry.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
