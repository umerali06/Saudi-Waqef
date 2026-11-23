"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { NavIcon } from "@/components/nav-icons";
import { NotificationsProvider, useNotifications } from "@/components/notifications-provider";
import { disablePush } from "@/lib/notifications/client";
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

const ADMIN_PAGES = [
  "access-requests", "health", "tenants", "alerts", "jobs", "dr", "migrations",
  "knowledge-base", "kpis", "audit", "support",
].map((page) => `/admin/${page}`);

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider companyId={null}>
      <AdminFrame>{children}</AdminFrame>
    </NotificationsProvider>
  );
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  const { unreadCount } = useNotifications();
  const { data } = useSession();
  const { t } = useTranslations();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);

  useEffect(() => {
    const fetchPending = () => {
      fetch("/api/admin/registrations?status=pending")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setPendingRegistrationsCount(Array.isArray(data?.requests) ? data.requests.length : 0))
        .catch(() => setPendingRegistrationsCount(0));
    };

    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, [unreadCount]);

  return (
    <div className="app-frame flex h-dvh overflow-hidden bg-background text-foreground">
      {isMobileNavOpen ? (
        <button
          type="button"
          aria-label={t("common.close")}
          className="scrim fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}
      <aside
        className={`app-sidebar fixed inset-y-0 start-0 z-40 flex w-64 shrink-0 flex-col transition-transform lg:static lg:translate-x-0 ${
          isMobileNavOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0"
        }`}
      >
        <div className="flex h-16 flex-col justify-center px-5">
          <span className="truncate text-[15px] font-semibold text-white">{t("admin.title")}</span>
          <span className="truncate text-xs text-[#7f93a8]">{t("app.name")}</span>
        </div>
        <nav
          className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-6 pt-2"
          aria-label={t("nav.section")}
          onClick={() => setIsMobileNavOpen(false)}
        >
          <NavLink href="/admin" label={t("admin.nav.overview")} icon={Icon.overview} excludes={ADMIN_PAGES} />
          <NavLink
            href="/admin/access-requests"
            label={t("admin.nav.registrations")}
            icon={Icon.registrations}
            badgeCount={pendingRegistrationsCount}
          />
          <NavLink href="/admin/notifications" label={t("nav.notifications")} icon="bell" badgeCount={unreadCount} />
          <NavLink href="/admin/health" label={t("admin.nav.health")} icon={Icon.health} />
          <NavLink href="/admin/tenants" label={t("admin.nav.tenants")} icon={Icon.tenants} />
          <NavLink href="/admin/alerts" label={t("admin.nav.alerts")} icon={Icon.alerts} />
          <NavLink href="/admin/jobs" label={t("admin.nav.jobs")} icon={Icon.jobs} />
          <NavLink href="/admin/dr" label={t("admin.nav.dr")} icon={Icon.dr} />
          <NavLink href="/admin/migrations" label={t("admin.nav.migrations")} icon={Icon.migrations} />
          <NavLink href="/admin/knowledge-base" label={t("admin.nav.knowledgeBase")} icon={Icon.knowledge} />
          <NavLink href="/admin/kpis" label={t("admin.nav.kpis")} icon={Icon.kpis} />
          <NavLink href="/admin/audit" label={t("admin.nav.audit")} icon={Icon.audit} />
          <NavLink href="/admin/support" label={t("admin.nav.support")} icon={Icon.support} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-header flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="icon-button lg:hidden"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label={t("nav.section")}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="ms-auto flex min-w-0 items-center gap-3">
            <LanguageSwitcher compact />
            <Link href="/admin/notifications" className="icon-button relative" aria-label={t("nav.notifications")}>
              <NavIcon name="bell" className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -end-0.5 -top-0.5 min-w-4 rounded-full bg-[#d0453b] px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <span className="hidden min-w-0 text-start leading-tight sm:block">
              <span className="block truncate text-sm font-medium">{data?.user?.name ?? t("common.user")}</span>
              <span className="block truncate text-xs text-muted" dir="ltr">{data?.user?.email ?? ""}</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                await disablePush().catch(() => undefined);
                await fetch("/api/admin/impersonate/end", { method: "POST" }).catch(() => undefined);
                await signOut({ callbackUrl: "/login" });
              }}
              className="btn-secondary"
            >
              {t("nav.signOut")}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
