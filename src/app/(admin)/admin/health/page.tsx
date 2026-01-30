"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/provider";

type Health = {
  db: {
    status: "ok" | "error";
    latencyMs: number;
  };
  alerts: {
    open: number;
    critical: number;
  };
  jobs: {
    id: string;
    name: string;
    category: string;
    status: string;
    lastRunAt?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
  }[];
};

export default function AdminHealthPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/health")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setHealth(data))
      .catch(() => setError(t("admin.errors.loadFailed")));
  }, [t]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.health.title")}</h1>
        <p className="text-sm text-muted">{t("admin.health.subtitle")}</p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`app-card p-4 ${alignClass}`}>
          <p className="text-xs uppercase text-muted">{t("admin.health.api")}</p>
          <p className="mt-2 text-lg font-semibold text-emerald-600">
            {t("admin.health.ok")}
          </p>
        </div>
        <div className={`app-card p-4 ${alignClass}`}>
          <p className="text-xs uppercase text-muted">{t("admin.health.database")}</p>
          <p
            className={`mt-2 text-lg font-semibold ${
              health?.db.status === "ok" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {health?.db.status === "ok" ? t("admin.health.ok") : t("admin.health.error")}
          </p>
          <p className="mt-2 text-xs text-muted">
            {t("admin.health.latency", { value: String(health?.db.latencyMs ?? "--") })}
          </p>
        </div>
        <div className={`app-card p-4 ${alignClass}`}>
          <p className="text-xs uppercase text-muted">{t("admin.health.alerts")}</p>
          <p className="mt-2 text-lg font-semibold">
            {health?.alerts.open ?? "--"}
          </p>
          <p className="mt-2 text-xs text-muted">
            {t("admin.health.critical", { value: String(health?.alerts.critical ?? "--") })}
          </p>
        </div>
      </div>

      <div className={`app-card p-4 ${alignClass}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("admin.health.jobs")}</h2>
        </div>
        {health?.jobs?.length ? (
          <div className="mt-3 space-y-2 text-sm">
            {health.jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <div>
                  <p className="font-semibold">{job.name}</p>
                  <p className="text-xs text-muted">{job.category}</p>
                </div>
                <div className="text-xs text-muted">
                  {t("admin.health.status")}: {job.status}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">{t("admin.health.noJobs")}</p>
        )}
      </div>
    </section>
  );
}
