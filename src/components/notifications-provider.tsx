"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { useTranslations } from "@/i18n/provider";
import { enablePush, playChime, unlockSound } from "@/lib/notifications/client";
import { isUrgentNotification, notificationUrl } from "@/lib/notifications/links";

export type Notification = {
  id: string;
  companyId: string | null;
  type: string;
  title: string;
  body: string;
  status: "read" | "unread";
  createdAt: string;
  readAt?: string | null;
  data?: Record<string, unknown>;
};

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}

const VISIBLE_POLL_MS = 6_000;
const HIDDEN_POLL_MS = 30_000;

/**
 * Keeps the notification list current and makes new ones heard. Pushes arrive
 * instantly through the service worker; a one-document version check covers
 * devices where push is off. `companyId` null means the platform console.
 */
export function NotificationsProvider({
  companyId,
  children,
}: {
  companyId: string | null;
  children: ReactNode;
}) {
  const { t } = useTranslations();
  const { toast } = useToast();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const knownIds = useRef<Set<string> | null>(null);
  const version = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications${companyId ? `?companyId=${companyId}` : ""}`);
      if (!res.ok) return;
      const list = ((await res.json()).notifications ?? []) as Notification[];
      const known = knownIds.current;
      // Nothing is "new" on the first load: those were waiting before this page opened.
      const fresh = known ? list.filter((item) => item.status === "unread" && !known.has(item.id)) : [];
      knownIds.current = new Set(list.map((item) => item.id));
      setNotifications(list);
      if (fresh.length > 0) {
        playChime(fresh.some((item) => isUrgentNotification(item.type)));
        fresh.slice(0, 3).forEach((item) =>
          toast(item.body ? `${item.title}: ${item.body}` : item.title, "info", {
            durationMs: isUrgentNotification(item.type) ? 12_000 : 6_000,
            onClick: () => router.push(notificationUrl(item.type, item.data)),
          })
        );
      }
    } catch {
      // Offline: the next check tries again.
    } finally {
      setLoading(false);
    }
  }, [companyId, router, toast]);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/state");
      if (!res.ok) return;
      const next = (await res.json()).version as number;
      if (version.current === next && knownIds.current) return;
      version.current = next;
      await load();
    } catch {
      // Offline: the next check tries again.
    }
  }, [load]);

  useEffect(() => {
    knownIds.current = null;
    version.current = null;
    setNotifications([]);
    setLoading(true);
    let timer = 0;
    let stopped = false;
    const loop = async () => {
      await check();
      if (!stopped) {
        timer = window.setTimeout(loop, document.hidden ? HIDDEN_POLL_MS : VISIBLE_POLL_MS);
      }
    };
    const now = () => {
      window.clearTimeout(timer);
      void loop();
    };
    const onVisible = () => {
      if (!document.hidden) now();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "notification") now();
      if (event.data?.type === "resubscribe") void enablePush(false).catch(() => undefined);
    };
    void loop();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", now);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", now);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [check]);

  useEffect(() => {
    // Re-registers a device that already allowed notifications; never prompts by itself.
    void enablePush(false).catch(() => undefined);
    window.addEventListener("pointerdown", unlockSound, { once: true });
    window.addEventListener("keydown", unlockSound, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
    };
  }, []);

  const unreadCount = notifications.filter((item) => item.status === "unread").length;

  // The tab title shows waiting notifications even when the tab is in the background.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${base}` : base;
  }, [unreadCount]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "read", readAt: new Date().toISOString() } : item
      )
    );
    const res = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    }).catch(() => null);
    if (!res?.ok) {
      toast(t("notifications.errors.updateFailed"), "error");
      await load();
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) return;
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, status: "read" as const, readAt: new Date().toISOString() }))
    );
    const res = await fetch("/api/notifications/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(companyId ? { companyId } : {}),
    }).catch(() => null);
    if (!res?.ok) {
      toast(t("notifications.errors.updateFailed"), "error");
      await load();
    }
  };

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh: load }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
