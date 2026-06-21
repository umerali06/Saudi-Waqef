"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { SkeletonBlock } from "@/components/skeleton";

type AuditEvent = {
  id: string;
  userId: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
};

type Member = {
  id: string;
  name: string;
  email: string;
};

const formatDateTime = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)}`;
};

export default function AuditLogPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [userId, setUserId] = useState("all");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [query, setQuery] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/users?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setMembers(data.users ?? []))
      .catch(() => setMembers([]));
  }, [activeCompanyId]);

  const loadEvents = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoading(true);
    setErrorKey(null);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (userId && userId !== "all") params.set("userId", userId);
    if (action) params.set("action", action.trim());
    if (entity) params.set("entity", entity.trim());
    if (query) params.set("q", query.trim());

    fetch(`/api/audit-logs?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoading(false));
  }, [activeCompanyId, action, endDate, query, startDate, userId, entity]);

  useEffect(() => {
    loadMembers();
    loadEvents();
  }, [loadEvents, loadMembers]);

  const userLookup = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((member) => map.set(member.id, member));
    return map;
  }, [members]);

  const downloadCsv = async () => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (userId && userId !== "all") params.set("userId", userId);
    if (action) params.set("action", action.trim());
    if (entity) params.set("entity", entity.trim());
    if (query) params.set("q", query.trim());

    const response = await fetch(`/api/audit-logs/export?${params.toString()}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-log.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("auditLog.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("auditLog.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("auditLog.filtersTitle")}</h2>
            <p className="text-xs text-muted">{t("auditLog.filtersSubtitle")}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-foreground"
              onClick={downloadCsv}
              disabled={events.length === 0}
            >
              {t("auditLog.export")}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("auditLog.startDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("auditLog.endDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("auditLog.user")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.email})
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("auditLog.action")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder={t("auditLog.actionPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("auditLog.entity")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={entity}
              onChange={(event) => setEntity(event.target.value)}
              placeholder={t("auditLog.entityPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("auditLog.search")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("auditLog.searchPlaceholder")}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast"
            onClick={loadEvents}
            disabled={loading}
          >
            {t("auditLog.applyFilters")}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-foreground"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setUserId("all");
              setAction("");
              setEntity("");
              setQuery("");
              setTimeout(() => loadEvents(), 0);
            }}
          >
            {t("auditLog.resetFilters")}
          </button>
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("auditLog.tableTitle")}
        </div>
        {loading ? (
          <div className="space-y-4 p-4">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : events.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("auditLog.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("auditLog.column.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("auditLog.column.user")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("auditLog.column.action")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("auditLog.column.entity")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("auditLog.column.entityId")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("auditLog.column.metadata")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(event.createdAt)}</td>
                    <td className="px-4 py-2">
                      {event.userEmail ?? userLookup.get(event.userId)?.email ?? "-"}
                    </td>
                    <td className="px-4 py-2">{event.action}</td>
                    <td className="px-4 py-2">{event.entity}</td>
                    <td className="px-4 py-2">{event.entityId ?? "-"}</td>
                    <td className="px-4 py-2 max-w-[360px] truncate">
                      {JSON.stringify(event.metadata ?? {})}
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
