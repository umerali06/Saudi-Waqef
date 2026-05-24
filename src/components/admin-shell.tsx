"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { NavLink } from "@/components/nav-link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslations } from "@/i18n/provider";

const Icon = {
  overview: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12h8V3H3v9zM13 21h8v-7h-8v7zM13 3h8v7h-8V3zM3 21h8v-7H3v7z" />
    </svg>
  ),
  registrations: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M16 11a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
      <path d="M4 20a8 8 0 0 1 16 0" />
      <path d="M19 8h3M20.5 6.5v3" />
    </svg>
  ),
  health: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 12h3l2-4 3 8 2-4h6" />
    </svg>
  ),
  tenants: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 9l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
      <path d="M9 22V12h6v10" />
    </svg>
  ),
  alerts: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.5L2.3 18a1 1 0 0 0 .9 1.5h17.6a1 1 0 0 0 .9-1.5l-8-14a1 1 0 0 0-1.4 0z" />
    </svg>
  ),
  jobs: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  ),
  dr: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3v7l4 2" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  migrations: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h11l-2-2" />
      <path d="M20 17H9l2 2" />
    </svg>
  ),
  knowledge: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4h11a2 2 0 0 1 2 2v12H6a2 2 0 0 0-2 2V4z" />
      <path d="M18 10h2a2 2 0 0 1 2 2v8a2 2 0 0 0-2-2h-2" />
    </svg>
  ),
  kpis: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19V11" />
    </svg>
  ),
  audit: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h6M8 11h6M8 15h4" />
      <path d="M18 7l2 2 3-3" />
    </svg>
  ),
  support: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h1v-6H6" />
      <path d="M12 2a7 7 0 0 1 7 7v4a3 3 0 0 1-3 3h-1v-6h3" />
      <path d="M8 20h8" />
    </svg>
  ),
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);

  useEffect(() => {
    const fetchPending = () => {
      fetch("/api/admin/registrations?status=pending")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setPendingRegistrationsCount(Array.isArray(data?.requests) ? data.requests.length : 0))
        .catch(() => setPendingRegistrationsCount(0));
    };

    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen app-shell">
        <aside className="w-72 app-sidebar px-4 py-6 lg:mx-4 lg:my-4 lg:rounded-3xl lg:h-[calc(100vh-2rem)]">
          <div className="mb-8 rounded-2xl px-4 py-4 text-primary-contrast shadow-sm brand-card">
            <p className="text-xs uppercase tracking-[0.2em] text-primary-contrast opacity-70">
              {t("admin.title")}
            </p>
            <p className="mt-2 text-sm font-semibold">{t("admin.subtitle")}</p>
          </div>
          <div className="mb-8 space-y-1 nav-group">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted nav-heading">
              {t("nav.section")}
            </p>
            <NavLink href="/admin" label={t("admin.nav.overview")} icon={Icon.overview} />
            <NavLink
              href="/admin/registrations"
              label={t("admin.nav.registrations")}
              icon={Icon.registrations}
              badgeCount={pendingRegistrationsCount}
            />
            <NavLink href="/admin/health" label={t("admin.nav.health")} icon={Icon.health} />
            <NavLink href="/admin/tenants" label={t("admin.nav.tenants")} icon={Icon.tenants} />
            <NavLink href="/admin/alerts" label={t("admin.nav.alerts")} icon={Icon.alerts} />
            <NavLink href="/admin/jobs" label={t("admin.nav.jobs")} icon={Icon.jobs} />
            <NavLink href="/admin/dr" label={t("admin.nav.dr")} icon={Icon.dr} />
            <NavLink
              href="/admin/migrations"
              label={t("admin.nav.migrations")}
              icon={Icon.migrations}
            />
            <NavLink
              href="/admin/knowledge-base"
              label={t("admin.nav.knowledgeBase")}
              icon={Icon.knowledge}
            />
            <NavLink href="/admin/kpis" label={t("admin.nav.kpis")} icon={Icon.kpis} />
            <NavLink href="/admin/audit" label={t("admin.nav.audit")} icon={Icon.audit} />
            <NavLink href="/admin/support" label={t("admin.nav.support")} icon={Icon.support} />
          </div>
          <div className="app-panel px-3 py-3 text-xs text-muted">
            {t("admin.footer")}
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-4 app-header">
            <LanguageSwitcher />
            <div className={`flex items-center gap-4 text-sm ${alignClass}`}>
              <div className="topbar-user">
                <div className="topbar-avatar">
                  {(data?.user?.name ?? t("common.user")).slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">
                    {data?.user?.name ?? t("common.user")}
                  </p>
                  <p className="text-xs text-muted">{data?.user?.email ?? ""}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="cursor-pointer rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
              >
                {t("nav.signOut")}
              </button>
            </div>
          </header>

          <main className="flex-1 px-6 py-10 app-main">{children}</main>
        </div>
      </div>
    </div>
  );
}
