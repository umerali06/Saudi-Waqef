"use client";

import { ChangePasswordForm } from "@/components/change-password-form";
import { useTranslations } from "@/i18n/provider";

export default function AccountPage() {
  const { t } = useTranslations();

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("account.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("account.subtitle")}</p>
      </div>
      <ChangePasswordForm />
    </section>
  );
}
