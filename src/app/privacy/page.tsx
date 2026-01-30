"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslations } from "@/i18n/provider";

export default function PrivacyPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-12 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className={`space-y-2 ${alignClass}`}>
            <p className="text-xs text-muted">{t("app.name")}</p>
            <h1 className="text-3xl font-semibold">{t("privacy.title")}</h1>
            <p className="text-sm text-muted">{t("privacy.subtitle")}</p>
            <p className="text-xs text-muted">{t("legal.updatedAt")}</p>
          </div>
          <LanguageSwitcher />
        </header>

        <section className={`space-y-6 ${alignClass}`}>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("privacy.section.data")}</h2>
            <p className="mt-2 text-sm text-muted">{t("privacy.section.data.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("privacy.section.usage")}</h2>
            <p className="mt-2 text-sm text-muted">{t("privacy.section.usage.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("privacy.section.security")}</h2>
            <p className="mt-2 text-sm text-muted">{t("privacy.section.security.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("privacy.section.retention")}</h2>
            <p className="mt-2 text-sm text-muted">{t("privacy.section.retention.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("privacy.section.contact")}</h2>
            <p className="mt-2 text-sm text-muted">{t("privacy.section.contact.body")}</p>
          </div>
        </section>

        <footer className={`flex flex-wrap items-center justify-between gap-4 text-xs text-muted ${alignClass}`}>
          <Link className="font-semibold text-foreground" href="/login">
            {t("legal.backToLogin")}
          </Link>
          <div className="flex items-center gap-4">
            <Link className="hover:text-foreground" href="/privacy">
              {t("legal.privacy")}
            </Link>
            <Link className="hover:text-foreground" href="/terms">
              {t("legal.terms")}
            </Link>
          </div>
          <span>© {new Date().getFullYear()} Saudi Waqef</span>
        </footer>
      </div>
    </main>
  );
}
