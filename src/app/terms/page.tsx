"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslations } from "@/i18n/provider";

export default function TermsPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-6 py-12 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className={`space-y-2 ${alignClass}`}>
            <p className="text-xs text-muted">{t("app.name")}</p>
            <h1 className="text-3xl font-semibold">{t("terms.title")}</h1>
            <p className="text-sm text-muted">{t("terms.subtitle")}</p>
            <p className="text-xs text-muted">{t("legal.updatedAt")}</p>
          </div>
          <LanguageSwitcher />
        </header>

        <section className={`space-y-6 ${alignClass}`}>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("terms.section.account")}</h2>
            <p className="mt-2 text-sm text-muted">{t("terms.section.account.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("terms.section.usage")}</h2>
            <p className="mt-2 text-sm text-muted">{t("terms.section.usage.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("terms.section.billing")}</h2>
            <p className="mt-2 text-sm text-muted">{t("terms.section.billing.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("terms.section.compliance")}</h2>
            <p className="mt-2 text-sm text-muted">{t("terms.section.compliance.body")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("terms.section.changes")}</h2>
            <p className="mt-2 text-sm text-muted">{t("terms.section.changes.body")}</p>
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
