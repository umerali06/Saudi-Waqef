"use client";

import { NotificationList } from "@/components/notification-list";
import { useTranslations } from "@/i18n/provider";

export default function AdminNotificationsPage() {
  const { t } = useTranslations();

  return (
    <section className="page-shell space-y-5">
      <div>
        <h1 className="page-title font-semibold">{t("notifications.title")}</h1>
        <p className="text-sm text-muted">{t("admin.notifications.subtitle")}</p>
      </div>
      <NotificationList />
    </section>
  );
}
