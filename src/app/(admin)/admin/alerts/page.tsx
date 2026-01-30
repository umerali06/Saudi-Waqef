"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/provider";

type Alert = {
  id: string;
  title: string;
  message: string;
  type: string;
  severity: string;
  status: string;
  createdAt: string;
};

export default function AdminAlertsPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (severityFilter !== "all") {
      params.set("severity", severityFilter);
    }
    fetch(`/api/admin/alerts?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setAlerts(data.alerts ?? []))
      .catch(() => setError(t("admin.errors.loadFailed")));
  }, [statusFilter, severityFilter, t]);

  const sortedAlerts = useMemo(
    () => alerts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [alerts]
  );

  const updateStatus = async (alertId: string, status: string) => {
    const response = await fetch(`/api/admin/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError(t("admin.errors.updateFailed"));
      return;
    }
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === alertId ? { ...alert, status } : alert))
    );
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.alerts.title")}</h1>
          <p className="text-sm text-muted">{t("admin.alerts.subtitle")}</p>
        </div>
        <a
          href={`/api/admin/alerts/export?status=${statusFilter}&severity=${severityFilter}`}
          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
        >
          {t("admin.alerts.exportCsv")}
        </a>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className={`app-card p-4 ${alignClass}`}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.alerts.status")}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="all">{t("common.all")}</option>
              <option value="open">{t("admin.alerts.status.open")}</option>
              <option value="acknowledged">{t("admin.alerts.status.acknowledged")}</option>
              <option value="resolved">{t("admin.alerts.status.resolved")}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.alerts.severity")}</span>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="all">{t("common.all")}</option>
              <option value="low">{t("admin.alerts.severity.low")}</option>
              <option value="medium">{t("admin.alerts.severity.medium")}</option>
              <option value="high">{t("admin.alerts.severity.high")}</option>
              <option value="critical">{t("admin.alerts.severity.critical")}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="app-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("admin.alerts.listTitle")}
        </div>
        {sortedAlerts.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">{t("admin.alerts.empty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedAlerts.map((alert) => (
              <div key={alert.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{alert.title}</p>
                    <p className="text-xs text-muted">{alert.message}</p>
                    <p className="text-xs text-muted">
                      {t("admin.alerts.type")}: {alert.type}
                    </p>
                  </div>
                  <div className={`text-xs text-muted ${alignClass}`}>
                    <p>
                      {t("admin.alerts.status")}: {alert.status}
                    </p>
                    <p>
                      {t("admin.alerts.severity")}: {alert.severity}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {alert.status !== "acknowledged" ? (
                      <button
                        type="button"
                        className="cursor-pointer rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground"
                        onClick={() => updateStatus(alert.id, "acknowledged")}
                      >
                        {t("admin.alerts.acknowledge")}
                      </button>
                    ) : null}
                    {alert.status !== "resolved" ? (
                      <button
                        type="button"
                        className="cursor-pointer rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700"
                        onClick={() => updateStatus(alert.id, "resolved")}
                      >
                        {t("admin.alerts.resolve")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
