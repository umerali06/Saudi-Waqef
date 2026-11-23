"use client";

import { useCompany } from "@/components/company-provider";
import { NotificationList } from "@/components/notification-list";
import { useTranslations } from "@/i18n/provider";

export default function NotificationsPage() {
  const { activeCompanyId } = useCompany();
  const { t } = useTranslations();

  return (
    <section className="page-shell space-y-5">
      <div>
        <h1 className="page-title font-semibold">{t("notifications.title")}</h1>
        <p className="text-sm text-muted">{t("notifications.subtitle")}</p>
      </div>
      <NotificationList
        exportHref={activeCompanyId ? `/api/notifications/export?companyId=${activeCompanyId}&status=all` : undefined}
      />
    </section>
  );
}
