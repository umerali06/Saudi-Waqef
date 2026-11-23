"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/notifications-provider";
import { useToast } from "@/components/toast";
import { useLocaleFormatters } from "@/i18n/formatters";
import { useTranslations } from "@/i18n/provider";
import { enablePush, isMuted, playChime, pushSupported, setMuted } from "@/lib/notifications/client";
import { isUrgentNotification, notificationUrl } from "@/lib/notifications/links";

type PushState = "unknown" | "enabled" | "denied" | "unsupported" | "off";

/** The notification centre, shared by companies and the platform console. */
export function NotificationList({ exportHref }: { exportHref?: string }) {
  const { t } = useTranslations();
  const { formatDateTime } = useLocaleFormatters();
  const { toast } = useToast();
  const router = useRouter();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [push, setPush] = useState<PushState>("unknown");
  const [muted, setMutedState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    if (!pushSupported()) setPush("unsupported");
    else if (window.Notification.permission === "denied") setPush("denied");
    else if (window.Notification.permission === "default") setPush("off");
    else
      enablePush(false)
        .then(setPush)
        .catch(() => setPush("off"));
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? notifications : notifications.filter((item) => item.status === filter)),
    [notifications, filter]
  );

  const turnOn = async () => {
    setBusy(true);
    try {
      setPush(await enablePush(true));
    } catch {
      toast(t("notifications.push.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    playChime();
    const res = await fetch("/api/notifications/test-delivery", { method: "POST" }).catch(() => null);
    toast(t(res?.ok ? "notifications.test.sent" : "notifications.test.failed"), res?.ok ? "success" : "error");
    await refresh();
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <section className="panel grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="text-sm font-semibold">{t("notifications.push.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t(`notifications.push.${push}`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {push === "off" ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={turnOn}>
              {t("notifications.push.enable")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary"
            aria-pressed={!muted}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
              if (muted) playChime();
            }}
          >
            {t(muted ? "notifications.sound.off" : "notifications.sound.on")}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={sendTest}>
            {t("notifications.test.action")}
          </button>
        </div>
      </section>

      <section className="panel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="segmented" role="group">
            {(["all", "unread", "read"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {value === "all" ? t("common.all") : t(`notifications.status.${value}`)}
                {value === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {exportHref ? (
              <a className="btn-secondary" href={exportHref}>
                {t("notifications.exportCsv")}
              </a>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              disabled={unreadCount === 0}
              onClick={() => markAllAsRead()}
            >
              {t("notifications.markAllRead")}
            </button>
          </div>
        </header>
        {visible.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            {loading ? t("common.loading") : t("notifications.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-3 px-5 py-3.5 text-start transition-colors hover:bg-surface-muted ${
                    item.status === "unread" ? "bg-[#f3f8fd]" : ""
                  }`}
                  onClick={async () => {
                    if (item.status === "unread") await markAsRead(item.id);
                    router.push(notificationUrl(item.type, item.data));
                  }}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      item.status === "read"
                        ? "bg-transparent"
                        : isUrgentNotification(item.type)
                          ? "bg-[#d0453b]"
                          : "bg-primary"
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${item.status === "unread" ? "font-semibold" : ""}`}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">{item.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
