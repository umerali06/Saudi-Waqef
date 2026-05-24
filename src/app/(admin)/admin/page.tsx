"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/provider";

type Overview = {
  companies: {
    total: number;
    active: number;
    suspended: number;
  };
  users: {
    total: number;
    active: number;
    invited: number;
  };
  subscriptions: Record<string, number>;
  churnedLast30Days: number;
  usage: {
    loginsLast30Days: number;
    invoicesLast30Days: number;
    payrollRunsLast30Days: number;
  };
  generatedAt: string;
};

export default function AdminOverviewPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setOverview(data))
      .catch(() => setError(t("admin.errors.loadFailed")));
  }, [t]);

  const subscriptionEntries = overview
    ? Object.entries(overview.subscriptions)
    : [];

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("admin.overview.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("admin.overview.subtitle")}</p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`app-card p-6 ${alignClass}`}>
          <p className="text-xs uppercase text-muted">{t("admin.overview.companies")}</p>
          <p className="mt-2 text-2xl font-semibold">
            {overview?.companies.total ?? "--"}
          </p>
          <div className="mt-2 text-xs text-muted">
            {t("admin.overview.active")}: {overview?.companies.active ?? "--"} ·
            {" "}{t("admin.overview.suspended")}: {overview?.companies.suspended ?? "--"}
          </div>
        </div>
        <div className={`app-card p-6 ${alignClass}`}>
          <p className="text-xs uppercase text-muted">{t("admin.overview.users")}</p>
          <p className="mt-2 text-2xl font-semibold">
            {overview?.users.total ?? "--"}
          </p>
          <div className="mt-2 text-xs text-muted">
            {t("admin.overview.active")}: {overview?.users.active ?? "--"} ·
            {" "}{t("admin.overview.invited")}: {overview?.users.invited ?? "--"}
          </div>
        </div>
        <div className={`app-card p-6 ${alignClass}`}>
          <p className="text-xs uppercase text-muted">{t("admin.overview.churn")}</p>
          <p className="mt-2 text-2xl font-semibold">
            {overview?.churnedLast30Days ?? "--"}
          </p>
          <p className="mt-2 text-xs text-muted">{t("admin.overview.last30Days")}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`app-card p-6 ${alignClass}`}>
          <h2 className="text-sm font-semibold">{t("admin.overview.subscriptions")}</h2>
          {subscriptionEntries.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("admin.overview.noData")}</p>
          ) : (
            <div className="mt-3 grid gap-2 text-sm">
              {subscriptionEntries.map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span>
                    {(() => {
                      const label = t(`admin.subscription.${status}`);
                      return label === `admin.subscription.${status}` ? status : label;
                    })()}
                  </span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={`app-card p-6 ${alignClass}`}>
          <h2 className="text-sm font-semibold">{t("admin.overview.usage")}</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{t("admin.overview.logins")}</span>
              <span className="font-semibold">{overview?.usage.loginsLast30Days ?? "--"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("admin.overview.invoices")}</span>
              <span className="font-semibold">{overview?.usage.invoicesLast30Days ?? "--"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("admin.overview.payroll")}</span>
              <span className="font-semibold">{overview?.usage.payrollRunsLast30Days ?? "--"}</span>
            </div>
          </div>
        </div>
      </div>

      <p className={`text-xs text-muted ${alignClass}`}>
        {t("admin.overview.generatedAt", { value: overview?.generatedAt ?? "--" })}
      </p>
    </section>
  );
}
