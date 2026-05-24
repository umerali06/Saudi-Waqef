"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useToast } from "@/components/toast";

type AccountingPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  frequency: "monthly" | "quarterly";
  status: "open" | "closed";
};

type NewPeriod = {
  name: string;
  startDate: string;
  endDate: string;
  frequency: "monthly" | "quarterly";
};

const EMPTY_PERIOD = {
  name: "",
  startDate: "",
  endDate: "",
  frequency: "monthly" as const,
};

export default function AccountingPeriodsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [periodLockDate, setPeriodLockDate] = useState<string>("");
  const [newPeriod, setNewPeriod] = useState<NewPeriod>(EMPTY_PERIOD);
  const [year, setYear] = useState(new Date().getFullYear());
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const formatDate = useCallback(
    (value: string) => {
      if (!value) {
        return "-";
      }
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
    },
    [locale]
  );

  const loadPeriods = useCallback(() => {
    if (!activeCompanyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    Promise.all([
      fetch(`/api/accounting-periods?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
    ])
      .then(([periodData, configData]) => {
        setPeriods(periodData.periods ?? []);
        setPeriodLockDate(configData?.config?.periodLockDate ?? "");
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  const mapPeriodError = (message?: string) => {
    switch (message) {
      case "Accounting period overlaps an existing period":
        return "periods.overlap";
      case "Invalid date range":
        return "periods.invalidRange";
      default:
        return "error.saveFailed";
    }
  };

  const handleGenerate = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/accounting-periods/generate", {
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
        setErrorKey(mapPeriodError(data?.error));
        return;
      }
      loadPeriods();
      toast(t("common.saved"), "success");
    });
  };

  const handleCreatePeriod = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/accounting-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          ...newPeriod,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPeriodError(data?.error));
        return;
      }
      setNewPeriod(EMPTY_PERIOD);
      loadPeriods();
      toast(t("common.saved"), "success");
    });
  };

  const handleToggleStatus = (periodId: string, status: "open" | "closed") => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/accounting-periods/${periodId}`, {
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
      loadPeriods();
      toast(t("common.saved"), "success");
    });
  };

  const handleLockDateSave = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLockDate: periodLockDate || null,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      toast(t("common.saved"), "success");
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("periods.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("periods.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("periods.lockTitle")}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("periods.lockDate")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-40" />
            ) : (
              <input
                type="date"
                className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={periodLockDate}
                onChange={(event) => setPeriodLockDate(event.target.value)}
              />
            )}
          </label>
          <button
            type="button"
            onClick={handleLockDateSave}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:opacity-50"
            disabled={isPending || isLoading}
          >
            {t("common.save")}
          </button>
        </div>
      </div>

      <div className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("periods.generateTitle")}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("periods.year")}</span>
            <input
              type="number"
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("periods.frequency")}
            </span>
            <select
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value as "monthly" | "quarterly")
              }
            >
              <option value="monthly">{t("periods.monthly")}</option>
              <option value="quarterly">{t("periods.quarterly")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("periods.generate")}
          </button>
        </div>
      </div>

      <form onSubmit={handleCreatePeriod} className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("periods.createTitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("periods.name")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={newPeriod.name}
              onChange={(event) =>
                setNewPeriod((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("periods.startDate")}
            </span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={newPeriod.startDate}
              onChange={(event) =>
                setNewPeriod((prev) => ({ ...prev, startDate: event.target.value }))
              }
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("periods.endDate")}
            </span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={newPeriod.endDate}
              onChange={(event) =>
                setNewPeriod((prev) => ({ ...prev, endDate: event.target.value }))
              }
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("periods.frequency")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={newPeriod.frequency}
              onChange={(event) =>
                setNewPeriod((prev) => ({
                  ...prev,
                  frequency: event.target.value as "monthly" | "quarterly",
                }))
              }
            >
              <option value="monthly">{t("periods.monthly")}</option>
              <option value="quarterly">{t("periods.quarterly")}</option>
            </select>
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="mt-4 w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("periods.create")}
        </button>
      </form>

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("periods.listTitle")}
        </div>
        {periods.length === 0 && !isLoading ? (
          <div className="p-4 text-sm text-muted">{t("periods.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("periods.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("periods.startDate")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("periods.endDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("periods.status")}
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    {t("periods.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2">
                          <SkeletonBlock className="h-5 w-24" />
                        </td>
                        <td className="px-4 py-2">
                          <SkeletonBlock className="h-5 w-24" />
                        </td>
                        <td className="px-4 py-2">
                          <SkeletonBlock className="h-5 w-24" />
                        </td>
                        <td className="px-4 py-2">
                          <SkeletonBlock className="h-5 w-16" />
                        </td>
                        <td className="px-4 py-2">
                          <SkeletonBlock className="h-5 w-12" />
                        </td>
                      </tr>
                    ))
                  : periods.map((period) => (
                      <tr key={period.id}>
                        <td className="px-4 py-2">{period.name}</td>
                        <td className="px-4 py-2">{formatDate(period.startDate)}</td>
                        <td className="px-4 py-2">{formatDate(period.endDate)}</td>
                        <td className="px-4 py-2">
                          {period.status === "open"
                            ? t("periods.open")
                            : t("periods.closed")}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-primary"
                            onClick={() =>
                              handleToggleStatus(
                                period.id,
                                period.status === "open" ? "closed" : "open"
                              )
                            }
                          >
                            {period.status === "open"
                              ? t("periods.close")
                              : t("periods.reopen")}
                          </button>
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
