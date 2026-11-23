"use client";

import Link from "next/link";
import { InvoiceVignette } from "@/components/auth/invoice-vignette";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslations } from "@/i18n/provider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslations();

  return (
    <div className="grid min-h-dvh bg-surface text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
                <path d="M4 20V10l8-6 8 6v10H4Zm5 0v-5.5a3 3 0 0 1 6 0V20" />
              </svg>
            </span>
            {t("app.name")}
          </Link>
          <LanguageSwitcher compact />
        </div>
        <main className="auth-form mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <footer className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <Link className="hover:text-foreground" href="/privacy">
            {t("legal.privacy")}
          </Link>
          <Link className="hover:text-foreground" href="/terms">
            {t("legal.terms")}
          </Link>
          <span>
            © {new Date().getFullYear()} {t("app.name")}
          </span>
        </footer>
      </div>

      <aside className="auth-aside sticky top-0 hidden h-dvh overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="auth-pattern" aria-hidden />
        <div className="relative max-w-lg">
          <h2 className="text-[1.9rem] font-semibold leading-[1.4]">{t("auth.marketing.title")}</h2>
          <p className="mt-3 max-w-md leading-7 text-[#c4d3e2]">{t("auth.marketing.subtitle")}</p>
        </div>
        <InvoiceVignette />
        <ul className="relative flex flex-wrap gap-x-8 gap-y-2 text-sm text-[#c4d3e2]">
          {(["vat", "accounting", "mfa"] as const).map((key) => (
            <li key={key}>{t(`auth.marketing.feature.${key}`)}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
