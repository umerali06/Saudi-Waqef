"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/provider";

type Job = {
  id: string;
  name: string;
  category: string;
  status: string;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
};

export default function AdminJobsPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/jobs")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setError(t("admin.errors.loadFailed")));
  }, [t]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.jobs.title")}</h1>
        <p className="text-sm text-muted">{t("admin.jobs.subtitle")}</p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="app-card">
        <div className={`border-b border-border px-4 py-3 text-sm font-semibold ${alignClass}`}>
          {t("admin.jobs.listTitle")}
        </div>
        {jobs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">{t("admin.jobs.empty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => (
              <div key={job.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{job.name}</p>
                    <p className="text-xs text-muted">{job.category}</p>
                  </div>
                  <div className={`text-xs text-muted ${alignClass}`}>
                    <p>
                      {t("admin.jobs.status")}: {job.status}
                    </p>
                    <p>
                      {t("admin.jobs.lastRun")}: {job.lastRunAt ?? "--"}
                    </p>
                    <p>
                      {t("admin.jobs.lastSuccess")}: {job.lastSuccessAt ?? "--"}
                    </p>
                  </div>
                  {job.lastError ? (
                    <p className="text-xs text-red-500">{job.lastError}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
