"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useCompany } from "@/components/company-provider";
import { useToast } from "@/components/toast";
import { useTranslations } from "@/i18n/provider";

export type Notification = {
  id: string;
  companyId: string;
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

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { activeCompanyId } = useCompany();
  const { t } = useTranslations();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!activeCompanyId) return;
    
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/notifications?companyId=${activeCompanyId}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeCompanyId]);

  // Initial fetch and polling
  useEffect(() => {
    if (!activeCompanyId) {
      setNotifications([]);
      return;
    }

    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 5000);

    const handleFocus = () => {
      fetchNotifications(true);
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [activeCompanyId, fetchNotifications]);

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: "read", readAt: new Date().toISOString() } : n));
    
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
    } catch {
      // Revert if failed (optional, or just show error)
      toast(t("notifications.errors.updateFailed"), "error");
      fetchNotifications(true);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => n.status === "unread").map(n => n.id);
    if (unreadIds.length === 0) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, status: "read", readAt: new Date().toISOString() })));

    try {
       // Assuming this route exists based on LS artifacts, if not I'll fix it
       const res = await fetch(`/api/notifications/mark-all-read`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
       toast(t("notifications.errors.updateFailed"), "error");
       fetchNotifications(true);
    }
  };
  
  const unreadCount = notifications.filter(n => n.status === "unread").length;

  const refresh = useCallback(() => fetchNotifications(false), [fetchNotifications]);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}
