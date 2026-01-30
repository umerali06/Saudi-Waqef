"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useTranslations } from "@/i18n/provider";

type DateFormat = "yyyy-MM-dd" | "dd/MM/yyyy" | "MM/dd/yyyy";

type TimeFormat = "24h" | "12h";

type RoundingMode = "standard" | "up" | "down";

type PreferenceConfig = {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  roundingPrecision: number;
  roundingMode: RoundingMode;
};

const EMPTY_CONFIG: PreferenceConfig = {
  dateFormat: "yyyy-MM-dd",
  timeFormat: "24h",
  roundingPrecision: 2,
  roundingMode: "standard",
};

export default function PreferencesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { setDirty, markClean } = useUnsavedChanges();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [config, setConfig] = useState<PreferenceConfig>(EMPTY_CONFIG);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const snapshot = useMemo(() => JSON.stringify(config), [config]);

  const loadConfig = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    markClean();
    fetch(`/api/companies/${activeCompanyId}/config`)
      .then((res) => res.json())
      .then((data) => {
        const cfg = data?.config ?? {};
        const nextConfig = {
          dateFormat: (cfg.dateFormat ?? EMPTY_CONFIG.dateFormat) as DateFormat,
          timeFormat: (cfg.timeFormat ?? EMPTY_CONFIG.timeFormat) as TimeFormat,
          roundingPrecision:
            typeof cfg.roundingPrecision === "number"
              ? cfg.roundingPrecision
              : EMPTY_CONFIG.roundingPrecision,
          roundingMode: (cfg.roundingMode ?? EMPTY_CONFIG.roundingMode) as RoundingMode,
        };
        setConfig(nextConfig);
        setInitialSnapshot(JSON.stringify(nextConfig));
        markClean();
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId, markClean]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!initialSnapshot) {
      return;
    }
    setDirty(snapshot !== initialSnapshot);
  }, [snapshot, initialSnapshot, setDirty]);

  const formatSampleDate = (format: DateFormat) => {
    const date = new Date("2026-01-15T00:00:00Z");
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    switch (format) {
      case "dd/MM/yyyy":
        return `${day}/${month}/${year}`;
      case "MM/dd/yyyy":
        return `${month}/${day}/${year}`;
      default:
        return `${year}-${month}-${day}`;
    }
  };

  const formatSampleTime = (format: TimeFormat) => {
    if (format === "12h") {
      return locale === "ar" ? "02:30 م" : "2:30 PM";
    }
    return "14:30";
  };

  const roundSample = (value: number) => {
    const factor = Math.pow(10, config.roundingPrecision);
    if (config.roundingMode === "up") {
      return Math.ceil(value * factor) / factor;
    }
    if (config.roundingMode === "down") {
      return Math.floor(value * factor) / factor;
    }
    return Math.round(value * factor) / factor;
  };

  const handleSave = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setInitialSnapshot(JSON.stringify(config));
      markClean();
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("preferences.title")}</h1>
        <p className="text-sm text-muted">{t("preferences.subtitle")}</p>
      </div>

      <div className="app-card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("preferences.dateFormat")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.dateFormat}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  dateFormat: event.target.value as DateFormat,
                }))
              }
            >
              <option value="yyyy-MM-dd">YYYY-MM-DD</option>
              <option value="dd/MM/yyyy">DD/MM/YYYY</option>
              <option value="MM/dd/yyyy">MM/DD/YYYY</option>
            </select>
            <p className="mt-1 text-xs text-muted">
              {t("preferences.sample")}: {formatSampleDate(config.dateFormat)}
            </p>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("preferences.timeFormat")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.timeFormat}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  timeFormat: event.target.value as TimeFormat,
                }))
              }
            >
              <option value="24h">{t("preferences.time24")}</option>
              <option value="12h">{t("preferences.time12")}</option>
            </select>
            <p className="mt-1 text-xs text-muted">
              {t("preferences.sample")}: {formatSampleTime(config.timeFormat)}
            </p>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("preferences.roundingPrecision")}
            </span>
            <input
              type="number"
              min={0}
              max={6}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.roundingPrecision}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  roundingPrecision: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("preferences.roundingMode")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.roundingMode}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  roundingMode: event.target.value as RoundingMode,
                }))
              }
            >
              <option value="standard">{t("preferences.rounding.standard")}</option>
              <option value="up">{t("preferences.rounding.up")}</option>
              <option value="down">{t("preferences.rounding.down")}</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          {t("preferences.roundingSample", {
            value: String(roundSample(1234.5678).toFixed(config.roundingPrecision)),
          })}
        </p>
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="button"
          className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          onClick={handleSave}
          disabled={isPending}
        >
          {t("common.save")}
        </button>
      </div>
    </section>
  );
}
