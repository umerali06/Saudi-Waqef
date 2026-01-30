"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "@/i18n/provider";

export default function SuspendedPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className={`app-card p-6 ${alignClass}`}>
        <h1 className="text-2xl font-semibold">{t("suspended.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("suspended.subtitle")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            {t("suspended.signOut")}
          </button>
          <a
            href="mailto:support@saudiwaqef.com"
            className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("suspended.contactSupport")}
          </a>
        </div>
      </div>
    </section>
  );
}
