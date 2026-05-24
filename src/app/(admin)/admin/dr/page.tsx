"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type DrSettings = {
  rpoMinutes: number;
  rtoMinutes: number;
  backupFrequencyHours: number;
  retentionDays: number;
  backupRegion: string;
  priorityCritical: string[];
  priorityHigh: string[];
  priorityMedium: string[];
  priorityLow: string[];
  lastReviewedAt?: string | null;
  approvedBy?: string | null;
};

type DrDrill = {
  id: string;
  type: "backup_restore" | "failover" | "tabletop" | "other";
  scope: string;
  status: "planned" | "in_progress" | "completed" | "failed";
  startedAt: string;
  completedAt?: string | null;
  rpoAchievedMinutes?: number | null;
  rtoAchievedMinutes?: number | null;
  runBy?: string | null;
  notes?: string | null;
};

const parseList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export default function AdminDrPage() {
  const { t, locale } = useTranslations();
  const { formatDateTime } = useLocaleFormatters();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [settings, setSettings] = useState<DrSettings | null>(null);
  const [drills, setDrills] = useState<DrDrill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drillForm, setDrillForm] = useState({
    type: "backup_restore",
    scope: "",
    status: "planned",
    startedAt: new Date().toISOString().slice(0, 16),
    completedAt: "",
    rpoAchievedMinutes: "",
    rtoAchievedMinutes: "",
    runBy: "",
    notes: "",
  });

  const priorityFields = useMemo(
    () => [
      {
        key: "priorityCritical",
        label: t("admin.dr.priority.critical"),
      },
      { key: "priorityHigh", label: t("admin.dr.priority.high") },
      { key: "priorityMedium", label: t("admin.dr.priority.medium") },
      { key: "priorityLow", label: t("admin.dr.priority.low") },
    ],
    [t]
  );

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [settingsRes, drillsRes] = await Promise.all([
        fetch("/api/admin/dr/settings"),
        fetch("/api/admin/dr/drills"),
      ]);
      if (!settingsRes.ok || !drillsRes.ok) {
        throw new Error(t("admin.errors.loadFailed"));
      }
      const settingsPayload = await settingsRes.json();
      const drillsPayload = await drillsRes.json();
      setSettings(settingsPayload.settings);
      setDrills(drillsPayload.drills ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSettingsChange = (field: keyof DrSettings, value: string) => {
    if (!settings) {
      return;
    }
    if (
      [
        "rpoMinutes",
        "rtoMinutes",
        "backupFrequencyHours",
        "retentionDays",
      ].includes(field)
    ) {
      setSettings({
        ...settings,
        [field]: Number(value || 0),
      });
      return;
    }
    if (
      [
        "priorityCritical",
        "priorityHigh",
        "priorityMedium",
        "priorityLow",
      ].includes(field)
    ) {
      setSettings({
        ...settings,
        [field]: parseList(value),
      });
      return;
    }
    setSettings({ ...settings, [field]: value });
  };

  const handleSaveSettings = async () => {
    if (!settings) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...settings,
        lastReviewedAt: settings.lastReviewedAt
          ? new Date(settings.lastReviewedAt).toISOString()
          : null,
      };
      const response = await fetch("/api/admin/dr/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("admin.errors.updateFailed"));
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDrill = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...drillForm,
        startedAt: new Date(drillForm.startedAt).toISOString(),
        completedAt: drillForm.completedAt
          ? new Date(drillForm.completedAt).toISOString()
          : null,
        rpoAchievedMinutes: drillForm.rpoAchievedMinutes
          ? Number(drillForm.rpoAchievedMinutes)
          : null,
        rtoAchievedMinutes: drillForm.rtoAchievedMinutes
          ? Number(drillForm.rtoAchievedMinutes)
          : null,
      };
      const response = await fetch("/api/admin/dr/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("admin.errors.updateFailed"));
      }
      setDrillForm({
        type: "backup_restore",
        scope: "",
        status: "planned",
        startedAt: new Date().toISOString().slice(0, 16),
        completedAt: "",
        rpoAchievedMinutes: "",
        rtoAchievedMinutes: "",
        runBy: "",
        notes: "",
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <p className="text-sm text-muted page-subtitle">{t("common.loading")}</p>;
  }

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("admin.dr.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("admin.dr.subtitle")}</p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="app-card space-y-6 p-6 card-modern">
        <div>
          <h2 className="text-lg font-semibold">{t("admin.dr.objectivesTitle")}</h2>
          <p className="text-sm text-muted page-subtitle">{t("admin.dr.objectivesSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.rpo")}</label>
            <input
              type="number"
              value={settings.rpoMinutes}
              onChange={(event) => handleSettingsChange("rpoMinutes", event.target.value)}
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.rto")}</label>
            <input
              type="number"
              value={settings.rtoMinutes}
              onChange={(event) => handleSettingsChange("rtoMinutes", event.target.value)}
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">
              {t("admin.dr.backupFrequency")}
            </label>
            <input
              type="number"
              value={settings.backupFrequencyHours}
              onChange={(event) =>
                handleSettingsChange("backupFrequencyHours", event.target.value)
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.retention")}</label>
            <input
              type="number"
              value={settings.retentionDays}
              onChange={(event) =>
                handleSettingsChange("retentionDays", event.target.value)
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.backupRegion")}</label>
            <input
              type="text"
              value={settings.backupRegion}
              onChange={(event) =>
                handleSettingsChange("backupRegion", event.target.value)
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.approvedBy")}</label>
            <input
              type="text"
              value={settings.approvedBy ?? ""}
              onChange={(event) => handleSettingsChange("approvedBy", event.target.value)}
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.reviewedAt")}</label>
            <input
              type="datetime-local"
              value={settings.lastReviewedAt?.slice(0, 16) ?? ""}
              onChange={(event) =>
                handleSettingsChange("lastReviewedAt", event.target.value)
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {priorityFields.map((field) => {
            const values = settings[field.key as keyof DrSettings];
            const displayValue = Array.isArray(values) ? values.join(", ") : "";
            return (
              <div key={field.key}>
                <label className="text-xs font-semibold">{field.label}</label>
                <input
                  type="text"
                  value={displayValue}
                  onChange={(event) =>
                    handleSettingsChange(field.key as keyof DrSettings, event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted">
                  {t("admin.dr.priorityHint")}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t("common.loading") : t("admin.dr.save")}
          </button>
        </div>
      </div>

      <div className="app-card space-y-4 p-6 card-modern">
        <div>
          <h2 className="text-lg font-semibold">{t("admin.dr.drillsTitle")}</h2>
          <p className="text-sm text-muted page-subtitle">{t("admin.dr.drillsSubtitle")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.drillType")}</label>
            <select
              value={drillForm.type}
              onChange={(event) =>
                setDrillForm({ ...drillForm, type: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="backup_restore">{t("admin.dr.type.backup")}</option>
              <option value="failover">{t("admin.dr.type.failover")}</option>
              <option value="tabletop">{t("admin.dr.type.tabletop")}</option>
              <option value="other">{t("admin.dr.type.other")}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.drillStatus")}</label>
            <select
              value={drillForm.status}
              onChange={(event) =>
                setDrillForm({ ...drillForm, status: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="planned">{t("admin.dr.status.planned")}</option>
              <option value="in_progress">{t("admin.dr.status.inProgress")}</option>
              <option value="completed">{t("admin.dr.status.completed")}</option>
              <option value="failed">{t("admin.dr.status.failed")}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.scope")}</label>
            <input
              type="text"
              value={drillForm.scope}
              onChange={(event) =>
                setDrillForm({ ...drillForm, scope: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.startedAt")}</label>
            <input
              type="datetime-local"
              value={drillForm.startedAt}
              onChange={(event) =>
                setDrillForm({ ...drillForm, startedAt: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.completedAt")}</label>
            <input
              type="datetime-local"
              value={drillForm.completedAt}
              onChange={(event) =>
                setDrillForm({ ...drillForm, completedAt: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.runBy")}</label>
            <input
              type="text"
              value={drillForm.runBy}
              onChange={(event) =>
                setDrillForm({ ...drillForm, runBy: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.rpoAchieved")}</label>
            <input
              type="number"
              value={drillForm.rpoAchievedMinutes}
              onChange={(event) =>
                setDrillForm({ ...drillForm, rpoAchievedMinutes: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">{t("admin.dr.rtoAchieved")}</label>
            <input
              type="number"
              value={drillForm.rtoAchievedMinutes}
              onChange={(event) =>
                setDrillForm({ ...drillForm, rtoAchievedMinutes: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold">{t("admin.dr.notes")}</label>
            <textarea
              value={drillForm.notes}
              onChange={(event) =>
                setDrillForm({ ...drillForm, notes: event.target.value })
              }
              className="mt-2 min-h-[90px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCreateDrill}
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t("common.loading") : t("admin.dr.createDrill")}
          </button>
        </div>
      </div>

      <div className="app-card card-modern">
        <div className={`border-b border-border px-4 py-3 text-sm font-semibold ${alignClass}`}>
          {t("admin.dr.historyTitle")}
        </div>
        {drills.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted page-subtitle">{t("admin.dr.history.empty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {drills.map((drill) => (
              <div key={drill.id} className="px-4 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="font-semibold">
                      {t(`admin.dr.type.${drill.type}`)} ·{" "}
                      {t(`admin.dr.status.${drill.status === "in_progress" ? "inProgress" : drill.status}`)}
                    </p>
                    <p className="text-xs text-muted">{drill.scope}</p>
                    <p className="text-xs text-muted">
                      {t("admin.dr.startedAt")}: {formatDateTime(drill.startedAt)}
                    </p>
                    <p className="text-xs text-muted">
                      {t("admin.dr.completedAt")}:{" "}
                      {drill.completedAt ? formatDateTime(drill.completedAt) : "--"}
                    </p>
                  </div>
                  <div className={`text-xs text-muted ${alignClass}`}>
                    <p>
                      {t("admin.dr.rpoAchieved")}: {drill.rpoAchievedMinutes ?? "--"}
                    </p>
                    <p>
                      {t("admin.dr.rtoAchieved")}: {drill.rtoAchievedMinutes ?? "--"}
                    </p>
                    <p>
                      {t("admin.dr.runBy")}: {drill.runBy ?? "--"}
                    </p>
                  </div>
                </div>
                {drill.notes ? (
                  <p className="mt-2 text-xs text-muted">{drill.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
