"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type Notification = {
  id: string;
  companyId: string;
  type: string;
  title: string;
  body: string;
  status: "read" | "unread";
  createdAt: string;
  readAt?: string | null;
};

export default function NotificationsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams();
    params.set("companyId", activeCompanyId);
    params.set("status", statusFilter);
    setLoading(true);
    fetch(`/api/notifications?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setNotifications(data.notifications ?? []))
      .catch(() => setError(t("notifications.errors.loadFailed")))
      .finally(() => setLoading(false));
  }, [activeCompanyId, statusFilter, t]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.status === "unread").length,
    [notifications]
  );

  const markRead = (id: string) => {
    startTransition(async () => {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
      });
      if (!response.ok) {
        setError(t("notifications.errors.updateFailed"));
        return;
      }
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "read" } : item
        )
      );
    });
  };

  const markAll = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      if (!response.ok) {
        setError(t("notifications.errors.updateFailed"));
        return;
      }
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, status: "read" }))
      );
    });
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const statusStyles: Record<Notification["status"], string> = {
    read: "bg-slate-200 text-slate-700",
    unread: "bg-emerald-100 text-emerald-700",
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("notifications.title")}</h1>
          <p className="text-sm text-muted">{t("notifications.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {t("notifications.unread", { count: String(unreadCount) })}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      <div className={`app-card p-4 ${alignClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">
              {t("notifications.filter")}
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
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
              className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
                activeCompanyId ? "" : "pointer-events-none opacity-60"
              }`}
            >
              {t("notifications.exportCsv")}
            </a>
            <button
              type="button"
              className="cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground"
              onClick={markAll}
              disabled={isPending || notifications.length === 0}
            >
              {t("notifications.markAllRead")}
            </button>
          </div>
        </div>
      </div>

      <div className="app-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("notifications.listTitle")}
        </div>
        {loading ? (
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
          <p className="px-4 py-4 text-sm text-muted">{t("notifications.empty")}</p>
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
                        onClick={() => markRead(item.id)}
                        disabled={isPending}
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
