"use client";

import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { useNotifications } from "@/components/notifications-provider";

export default function NotificationsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  
  const { notifications: allNotifications, loading, markAsRead, markAllAsRead, refresh } = useNotifications();
  const [statusFilter, setStatusFilter] = useState("all");

  // Refresh on mount to ensure fresh data
  useEffect(() => {
    refresh();
  }, [refresh]);

  const notifications = useMemo(() => {
    if (statusFilter === "all") return allNotifications;
    return allNotifications.filter((item) => item.status === statusFilter);
  }, [allNotifications, statusFilter]);

  const unreadCount = useMemo(
    () => allNotifications.filter((item) => item.status === "unread").length,
    [allNotifications]
  );

  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return value;
    }
  };

  const statusStyles: Record<string, string> = {
    read: "bg-slate-200 text-slate-700",
    unread: "bg-emerald-100 text-emerald-700",
  };

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("notifications.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("notifications.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {t("notifications.unread", { count: String(unreadCount) })}
        </div>
      </div>

      <div className={`app-card p-6 ${alignClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">
              {t("notifications.filter")}
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="all">{t("common.all")}</option>
              <option value="unread">{t("notifications.status.unread")}</option>
              <option value="read">{t("notifications.status.read")}</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={
                activeCompanyId
                  ? `/api/notifications/export?companyId=${activeCompanyId}&status=${statusFilter}`
                  : "#"
              }
              className={`rounded-2xl border border-border px-3 py-2 text-xs font-semibold ${
                activeCompanyId ? "" : "pointer-events-none opacity-60"
              }`}
            >
              {t("notifications.exportCsv")}
            </a>
            <button
              type="button"
              className="cursor-pointer rounded-2xl border border-border bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
              onClick={async () => {
                if (!activeCompanyId) return;
                try {
                  await fetch("/api/notifications", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      companyId: activeCompanyId,
                      title: "Test Notification",
                      body: "This is a test notification to verify functionality.",
                      type: "info",
                    }),
                  });
                  refresh();
                } catch (error) {
                  console.error("Failed to send test notification", error);
                }
              }}
              disabled={!activeCompanyId}
            >
              Test Notification
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-2xl border border-border px-3 py-2 text-xs font-semibold text-foreground"
              onClick={() => markAllAsRead()}
              disabled={unreadCount === 0}
            >
              {t("notifications.markAllRead")}
            </button>
          </div>
        </div>
      </div>

      <div className="app-card card-modern">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("notifications.listTitle")}
        </div>
        {loading && notifications.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBlock className="h-3 w-48" />
                <SkeletonBlock className="h-3 w-80" />
                <SkeletonBlock className="h-3 w-40" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted page-subtitle">{t("notifications.empty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((item) => (
              <div key={item.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-muted">{item.body}</p>
                    <p className="text-xs text-muted">{formatDate(item.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[11px] ${statusStyles[item.status]}`}>
                      {t(`notifications.status.${item.status}`)}
                    </span>
                    {item.status === "unread" ? (
                      <button
                        type="button"
                        className="cursor-pointer rounded-lg border border-border px-2 py-1 text-xs font-semibold"
                        onClick={() => markAsRead(item.id)}
                      >
                        {t("notifications.markRead")}
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
