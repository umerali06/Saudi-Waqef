"use client";

import { useSession, signOut } from "next-auth/react";
import { NavLink } from "@/components/nav-link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslations } from "@/i18n/provider";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="w-72 border-e border-border bg-surface px-4 py-6 shadow-sm">
          <div className="mb-8 rounded-2xl bg-primary px-4 py-4 text-primary-contrast shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-primary-contrast opacity-70">
              {t("admin.title")}
            </p>
            <p className="mt-2 text-sm font-semibold">{t("admin.subtitle")}</p>
          </div>
          <div className="mb-8 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              {t("nav.section")}
            </p>
            <NavLink href="/admin" label={t("admin.nav.overview")} />
            <NavLink href="/admin/registrations" label={t("admin.nav.registrations")} />
            <NavLink href="/admin/health" label={t("admin.nav.health")} />
            <NavLink href="/admin/tenants" label={t("admin.nav.tenants")} />
            <NavLink href="/admin/alerts" label={t("admin.nav.alerts")} />
            <NavLink href="/admin/jobs" label={t("admin.nav.jobs")} />
            <NavLink href="/admin/dr" label={t("admin.nav.dr")} />
            <NavLink href="/admin/migrations" label={t("admin.nav.migrations")} />
            <NavLink href="/admin/knowledge-base" label={t("admin.nav.knowledgeBase")} />
            <NavLink href="/admin/kpis" label={t("admin.nav.kpis")} />
            <NavLink href="/admin/audit" label={t("admin.nav.audit")} />
            <NavLink href="/admin/support" label={t("admin.nav.support")} />
          </div>
          <div className="app-panel px-3 py-3 text-xs text-muted">
            {t("admin.footer")}
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
            <LanguageSwitcher />
            <div className={`flex items-center gap-4 text-sm ${alignClass}`}>
              <div>
                <p className="font-semibold">
                  {data?.user?.name ?? t("common.user")}
                </p>
                <p className="text-xs text-muted">{data?.user?.email ?? ""}</p>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted transition hover:bg-surface-muted hover:text-foreground"
              >
                {t("nav.signOut")}
              </button>
            </div>
          </header>

          <main className="flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
