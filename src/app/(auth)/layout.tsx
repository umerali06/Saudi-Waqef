"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslations } from "@/i18n/provider";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const dir = locale === "ar" ? "rtl" : "ltr";
  return (
    <div
      dir={dir}
      className="min-h-screen bg-gradient-to-br from-[#f6f1e8] via-[#f7f3ea] to-[#eef6f5] text-foreground"
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-[#0c5f5a]/10 blur-3xl" />
        <div className="absolute right-10 top-0 h-64 w-64 rounded-full bg-[#b08968]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[#0c5f5a]/5 blur-[90px]" />
      </div>
      <div className="grid min-h-screen w-full grid-cols-1 items-stretch lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative hidden h-full flex-col gap-10 px-12 py-16 lg:flex">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#e7dfd3] via-[#efe7db] to-[#dde9e6]" />
          <div className="absolute inset-0 -z-10 opacity-50">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 20%, rgba(12,95,90,0.08), transparent 60%), radial-gradient(circle at 85% 10%, rgba(176,137,104,0.12), transparent 55%)",
              }}
            />
          </div>
          <div
            className="absolute inset-0 -z-10 opacity-25"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(12,95,90,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(12,95,90,0.08) 1px, transparent 1px)",
              backgroundSize: "96px 96px",
            }}
          />
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-muted">
              Saudi Waqef
            </div>
            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>
          </div>
          <div className="max-w-xl space-y-6">
            <div className={`${alignClass} space-y-4`}>
              <h1 className="text-4xl font-semibold leading-tight text-foreground">
                {t("auth.marketing.title")}
              </h1>
              <p className="text-sm text-foreground/85">
                {t("auth.marketing.subtitle")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                t("auth.marketing.feature.accounting"),
                t("auth.marketing.feature.vat"),
                t("auth.marketing.feature.mfa"),
                t("auth.marketing.feature.arabic"),
                t("auth.marketing.feature.audit"),
                t("auth.marketing.feature.approvals"),
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-[#cdbfae] bg-white/95 px-4 py-3 text-xs font-semibold text-foreground/85 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.6)]"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d7c9b8] bg-[#fdf7f0] text-[10px] text-[#0c5f5a]">
                    ✓
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[#cdbfae] bg-white/95 p-4 text-xs text-foreground/80 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.45)]">
              {t("auth.marketing.trust")}
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-3 text-[11px] text-foreground/75">
            <span className="rounded-full border border-[#cdbfae] bg-white/95 px-3 py-1">
              {t("auth.marketing.badge.soc")}
            </span>
            <span className="rounded-full border border-[#cdbfae] bg-white/95 px-3 py-1">
              {t("auth.marketing.badge.iso")}
            </span>
            <span className="rounded-full border border-[#cdbfae] bg-white/95 px-3 py-1">
              {t("auth.marketing.badge.ksa")}
            </span>
          </div>
        </div>
        <div className="relative flex min-h-screen w-full items-center justify-center px-6 py-12 lg:bg-white/70 lg:px-12 lg:backdrop-blur">
          <div className="absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-transparent via-[#d9cdbf] to-transparent lg:block" />
          <div
            className="absolute inset-0 -z-10 hidden opacity-10 lg:block"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(12,95,90,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(12,95,90,0.08) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
            }}
          />
          <div className="absolute top-0 hidden h-1 w-full bg-gradient-to-r from-[#0c5f5a] via-[#1a7a73] to-[#b08968] lg:block" />
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-end lg:hidden">
              <LanguageSwitcher />
            </div>
            <div className="rounded-[24px] border border-[#eadfd2] bg-white/85 p-8 shadow-[0_30px_70px_-60px_rgba(12,95,90,0.6)] backdrop-blur">
              {children}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-[11px] text-muted">
                <a className="hover:text-foreground" href="/privacy">
                  {t("legal.privacy")}
                </a>
                <a className="hover:text-foreground" href="/terms">
                  {t("legal.terms")}
                </a>
                <span>© {new Date().getFullYear()} Saudi Waqef</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
