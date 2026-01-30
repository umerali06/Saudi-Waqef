"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type MigrationSummary = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "applied" | "failed";
  lastRunAt?: string | null;
  lastRunStatus?: "running" | "completed" | "failed" | null;
  lastRunDryRun?: boolean;
  lastRunBy?: string | null;
  lastResult?: {
    scanned: number;
    updated: number;
    notes?: string[];
  } | null;
  appliedAt?: string | null;
};

type MigrationRun = {
  id: string;
  migrationId: string;
  title: string;
  status: "running" | "completed" | "failed";
  dryRun: boolean;
  scanned: number;
  updated: number;
  notes?: string[];
  error?: string | null;
  logs?: string[];
  startedBy?: string | null;
  startedAt: string;
  completedAt?: string | null;
};

export default function AdminMigrationsPage() {
  const { t, locale } = useTranslations();
  const { formatDateTime, formatNumber } = useLocaleFormatters();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [migrations, setMigrations] = useState<MigrationSummary[]>([]);
  const [runs, setRuns] = useState<MigrationRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetch("/api/admin/migrations")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setMigrations(data.migrations ?? []);
        setRuns(data.runs ?? []);
      })
      .catch(() => setError(t("admin.errors.loadFailed")))
      .finally(() => setIsLoading(false));
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRun = async (migrationId: string, dryRun: boolean) => {
    const confirmMessage = dryRun
      ? t("admin.migrations.confirmDryRun", { id: migrationId })
      : t("admin.migrations.confirmRun", { id: migrationId });
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setRunningId(migrationId);
    setError(null);
    try {
      const response = await fetch("/api/admin/migrations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ migrationId, dryRun }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || t("admin.errors.updateFailed"));
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.updateFailed"));
    } finally {
      setRunningId(null);
    }
  };

  const statusBadge = (status: MigrationSummary["status"]) => {
    const base = "rounded-full px-3 py-1 text-xs font-semibold";
    switch (status) {
      case "applied":
        return `${base} bg-emerald-50 text-emerald-700`;
      case "failed":
        return `${base} bg-rose-50 text-rose-700`;
      case "running":
        return `${base} bg-amber-50 text-amber-700`;
      default:
        return `${base} bg-surface-muted text-muted`;
    }
  };

  const resolveStatusLabel = (migration: MigrationSummary) => {
    if (migration.lastRunStatus === "running" || migration.status === "running") {
      return t("admin.migrations.status.running");
    }
    if (migration.lastRunStatus === "failed" || migration.status === "failed") {
      return t("admin.migrations.status.failed");
    }
    if (migration.status === "applied") {
      return t("admin.migrations.status.applied");
    }
    return t("admin.migrations.status.pending");
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.migrations.title")}</h1>
        <p className="text-sm text-muted">{t("admin.migrations.subtitle")}</p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="app-card">
        <div className={`border-b border-border px-4 py-3 text-sm font-semibold ${alignClass}`}>
          {t("admin.migrations.listTitle")}
        </div>
        {isLoading ? (
          <p className="px-4 py-4 text-sm text-muted">{t("common.loading")}</p>
        ) : migrations.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">{t("admin.migrations.noRuns")}</p>
        ) : (
          <div className="divide-y divide-border">
            {migrations.map((migration) => (
              <div key={migration.id} className="px-4 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold">{migration.title}</p>
                      <span className={statusBadge(migration.status)}>
                        {resolveStatusLabel(migration)}
                      </span>
                      {migration.lastRunDryRun ? (
                        <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-muted">
                          {t("admin.migrations.dryRun")}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">{migration.description}</p>
                    <div className={`text-xs text-muted ${alignClass}`}>
                      <p>
                        {t("admin.migrations.lastRun")}:{" "}
                        {migration.lastRunAt
                          ? formatDateTime(migration.lastRunAt)
                          : "--"}
                      </p>
                      <p>
                        {t("admin.migrations.lastRunBy")}:{" "}
                        {migration.lastRunBy ?? "--"}
                      </p>
                    </div>
                    {migration.lastResult ? (
                      <div className="mt-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
                        <p className="font-semibold">{t("admin.migrations.lastResult")}</p>
                        <p>
                          {t("admin.migrations.scanned")}:{" "}
                          {formatNumber(migration.lastResult.scanned)} ·{" "}
                          {t("admin.migrations.updated")}:{" "}
                          {formatNumber(migration.lastResult.updated)}
                        </p>
                        {migration.lastResult.notes?.length ? (
                          <ul className="mt-2 list-disc ps-4 text-xs text-muted">
                            {migration.lastResult.notes.map((note) => (
                              <li key={note}>{note}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRun(migration.id, true)}
                      disabled={runningId === migration.id}
                      className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t("admin.migrations.dryRun")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRun(migration.id, false)}
                      disabled={runningId === migration.id}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {runningId === migration.id
                        ? t("admin.migrations.running")
                        : t("admin.migrations.run")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="app-card">
        <div className={`border-b border-border px-4 py-3 text-sm font-semibold ${alignClass}`}>
          {t("admin.migrations.historyTitle")}
        </div>
        {runs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">{t("admin.migrations.history.empty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <details key={run.id} className="px-4 py-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                  {run.title} · {run.dryRun ? t("admin.migrations.dryRun") : t("admin.migrations.run")}
                </summary>
                <div className={`mt-3 space-y-2 text-xs text-muted ${alignClass}`}>
                  <p>
                    {t("admin.migrations.history.status")}: {run.status}
                  </p>
                  <p>
                    {t("admin.migrations.history.startedAt")}: {formatDateTime(run.startedAt)}
                  </p>
                  <p>
                    {t("admin.migrations.history.completedAt")}:{" "}
                    {run.completedAt ? formatDateTime(run.completedAt) : "--"}
                  </p>
                  <p>
                    {t("admin.migrations.history.result")}:{" "}
                    {t("admin.migrations.scanned")} {formatNumber(run.scanned)} ·{" "}
                    {t("admin.migrations.updated")} {formatNumber(run.updated)}
                  </p>
                  {run.error ? (
                    <p className="text-rose-600">{run.error}</p>
                  ) : null}
                  {run.logs?.length ? (
                    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-[11px] leading-relaxed text-foreground">
                      <p className="mb-2 text-xs font-semibold">
                        {t("admin.migrations.history.logs")}
                      </p>
                      <pre className="whitespace-pre-wrap">{run.logs.join("\n")}</pre>
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
