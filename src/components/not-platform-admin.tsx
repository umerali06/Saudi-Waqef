"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export function NotPlatformAdmin() {
  const { t } = useTranslations();

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="panel w-full max-w-lg p-7">
        <h1 className="text-xl font-semibold">{t("admin.notAllowed.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{t("admin.notAllowed.description")}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn-primary">
            {t("admin.notAllowed.toDashboard")}
          </Link>
          <Link href="/admin/registrations" className="btn-secondary">
            {t("admin.notAllowed.toRequests")}
          </Link>
        </div>
      </div>
    </main>
  );
}
