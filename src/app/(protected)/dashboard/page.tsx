"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { FinanceSections, Panel, PanelLink } from "@/components/dashboard/finance-sections";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";
import type { DashboardData } from "@/lib/reports/dashboard";
import type { Role } from "@/lib/types";

const DAY_MS = 86_400_000;
const REFRESH_MS = 5 * 60 * 1000;

type Preset = "d30" | "d90" | "year" | "custom";
type DateRange = { startDate: string; endDate: string };

const iso = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const presetRange = (preset: Exclude<Preset, "custom">): DateRange => {
  const now = new Date();
  if (preset === "year") return { startDate: `${now.getFullYear()}-01-01`, endDate: iso(now) };
  const days = preset === "d30" ? 29 : 89;
  return { startDate: iso(new Date(now.getTime() - days * DAY_MS)), endDate: iso(now) };
};

export default function DashboardPage() {
  const { activeCompany, activeCompanyId } = useCompany();
  const { t } = useTranslations();
  const [preset, setPreset] = useState<Preset>("d30");
  const [range, setRange] = useState<DateRange>(() => presetRange("d30"));
  const [custom, setCustom] = useState<DateRange>(range);
  const [data, setData] = useState<DashboardData | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { formatCurrency, formatNumber, formatPercent, formatDate, formatDateTime } =
    useLocaleFormatters({ currency: data?.currency });

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/dashboard?${new URLSearchParams({ companyId: activeCompanyId, ...range })}`
      );
      if (!response.ok) throw new Error(String(response.status));
      const json = await response.json();
      setData(json.dashboard);
      setRole(json.role);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, range]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // Figures from one company must never linger under another company's name.
  useEffect(() => {
    setData(null);
  }, [activeCompanyId]);

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") {
      const nextRange = presetRange(next);
      setRange(nextRange);
      setCustom(nextRange);
    }
  };

  const customValid = custom.startDate && custom.endDate && custom.startDate <= custom.endDate;
  const finance = data?.finance ?? null;

  return (
    <div className="dashboard mx-auto max-w-[1320px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {activeCompany?.name ?? t("common.company")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {finance
              ? `${formatDate(finance.overview.range.startDate)} - ${formatDate(finance.overview.range.endDate)}`
              : t("dashboard.title")}
            {data ? (
              <span className="ms-2 text-xs">
                {t("analytics.updatedAt", { value: formatDateTime(data.generatedAt) })}
              </span>
            ) : null}
          </p>
        </div>
        {role && ["owner", "admin", "accountant", "viewer"].includes(role) ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented" role="group" aria-label={t("dashboard.period")}>
              {(["d30", "d90", "year", "custom"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={preset === item}
                  onClick={() => choosePreset(item)}
                >
                  {t(`dashboard.range.${item}`)}
                </button>
              ))}
            </div>
            <a
              className="btn-secondary"
              href={`/api/analytics/export?${new URLSearchParams({ companyId: activeCompanyId ?? "", ...range })}`}
            >
              {t("analytics.export")}
            </a>
            {role !== "viewer" ? (
              <Link className="btn-primary" href="/sales/invoices/new">
                {t("dashboard.newInvoice")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {preset === "custom" ? (
        <form
          className="panel flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (customValid) setRange(custom);
          }}
        >
          {(["startDate", "endDate"] as const).map((key) => (
            <label key={key} className="text-xs text-muted">
              <span className="mb-1 block">{t(`analytics.filters.${key}`)}</span>
              <input
                type="date"
                className="border border-border px-3 py-2 text-sm text-foreground"
                value={custom[key]}
                onChange={(event) => setCustom((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </label>
          ))}
          <button type="submit" className="btn-primary" disabled={!customValid}>
            {t("analytics.filters.apply")}
          </button>
        </form>
      ) : null}

      {failed ? (
        <div className="panel flex items-center justify-between gap-3 border-s-4 border-s-[#b3372f] p-4 text-sm">
          <span>{t("analytics.error.loadFailed")}</span>
          <button type="button" className="btn-secondary" onClick={load}>
            {t("analytics.refresh")}
          </button>
        </div>
      ) : null}

      {!data && loading ? (
        <div className="space-y-5" aria-busy="true">
          <div className="panel h-28 animate-pulse" />
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="panel h-80 animate-pulse lg:col-span-2" />
            <div className="panel h-80 animate-pulse" />
          </div>
        </div>
      ) : null}

      {data ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {finance ? <FinanceSections finance={finance} currency={data.currency} role={role} /> : null}

          {data.hr ? (
            <Panel
              title={t("analytics.section.hr")}
              action={<PanelLink href="/hr">{t("dashboard.open")}</PanelLink>}
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {[
                  [t("analytics.kpi.activeEmployees"), formatNumber(data.hr.activeEmployees)],
                  [t("analytics.kpi.payrollCost"), formatCurrency(data.hr.payrollCost)],
                  [t("analytics.kpi.leaveDays"), formatNumber(data.hr.leaveDays)],
                  [t("analytics.kpi.absenteeism"), formatPercent(data.hr.absenteeismRate)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ) : null}

          {!finance && !data.hr ? (
            <Panel title={t("dashboard.yourWork")}>
              <ul className="grid gap-3 sm:grid-cols-3">
                {[
                  ["/hr/attendance", t("dashboard.link.attendance")],
                  ["/hr/leave", t("dashboard.link.leave")],
                  ["/hr/my-profile", t("hr.self.title")],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="block rounded-lg border border-border px-4 py-3 text-sm font-medium hover:border-primary"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
