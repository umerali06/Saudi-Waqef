"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { CompanySwitcher } from "@/components/company-switcher";
import { NavLink } from "@/components/nav-link";
import { useTranslations } from "@/i18n/provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useCompany } from "@/components/company-provider";
import { useNotifications } from "@/components/notifications-provider";
import { canAccessPath, getAllowedModules } from "@/lib/permissions";
import { usePathname, useRouter } from "next/navigation";

const Icon = {
  dashboard: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12h8V3H3v9zM13 21h8v-7h-8v7zM13 3h8v7h-8V3zM3 21h8v-7H3v7z" />
    </svg>
  ),
  bell: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  sales: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M21 7v6h-6" />
    </svg>
  ),
  purchases: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 3h3l2.2 10.4a2 2 0 0 0 2 1.6H19a2 2 0 0 0 2-1.6L22 7H7" />
      <circle cx="10" cy="20" r="1.8" />
      <circle cx="17" cy="20" r="1.8" />
    </svg>
  ),
  payments: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  ),
  items: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 7L12 2 3 7l9 5 9-5z" />
      <path d="M3 7v10l9 5 9-5V7" />
      <path d="M12 12v10" />
    </svg>
  ),
  documents: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  ),
  hr: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M16 11a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  ),
  reports: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4v16h16" />
      <path d="M7 14l3-3 3 2 4-5" />
    </svg>
  ),
  support: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h1v-6H6" />
      <path d="M12 2a7 7 0 0 1 7 7v4a3 3 0 0 1-3 3h-1v-6h3" />
      <path d="M8 20h8" />
    </svg>
  ),
  help: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
      <circle cx="12" cy="17" r="1" />
    </svg>
  ),
  developers: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 9l-4 3 4 3" />
      <path d="M16 9l4 3-4 3" />
      <path d="M13 7l-2 10" />
    </svg>
  ),
  admin: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
      <path d="M3 12h2l1-3 3-1 2-2 3 2 3-2 2 2 3 1 1 3h2" />
    </svg>
  ),
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { activeCompany, activeCompanyId } = useCompany();
  const { unreadCount } = useNotifications();
  const showTenantBanner = ["owner", "admin"].includes(activeCompany?.role ?? "");
  const activeRole = activeCompany?.role ?? "viewer";
  const [planModules, setPlanModules] = useState<string[] | null>(null);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);
  const [impersonation, setImpersonation] = useState<{
    impersonationId: string;
    adminEmail?: string;
    targetEmail?: string;
    targetName?: string;
    companyId?: string | null;
  } | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/billing/subscription?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        const modules = data?.plan?.modules;
        setPlanModules(Array.isArray(modules) ? modules : null);
      })
      .catch(() => setPlanModules(null));
  }, [activeCompanyId]);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((data) => setIsSystemAdmin(Boolean(data?.isSystemAdmin)))
      .catch(() => setIsSystemAdmin(false));
  }, []);

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

  useEffect(() => {
    fetch("/api/admin/impersonation")
      .then((res) => res.json())
      .then((data) => {
        if (data?.active && data?.impersonation) {
          setImpersonation({
            impersonationId: data.impersonation.id,
            adminEmail: data.impersonation.adminEmail ?? undefined,
            targetEmail: data.impersonation.targetEmail ?? undefined,
            targetName: data.impersonation.targetName ?? undefined,
            companyId: data.impersonation.companyId ?? undefined,
          });
        } else {
          setImpersonation(null);
        }
      })
      .catch(() => setImpersonation(null));
  }, []);

  const hasModule = (moduleKey: string) =>
    !planModules || planModules.length === 0 || planModules.includes(moduleKey);

  const allowedModules = useMemo(
    () => getAllowedModules(activeCompany?.role ?? "viewer"),
    [activeCompany?.role]
  );

  useEffect(() => {
    if (!pathname) {
      return;
    }
    if (!canAccessPath(activeCompany?.role ?? "viewer", pathname)) {
      router.replace("/dashboard");
    }
  }, [pathname, activeCompany?.role, router]);

  return (
    <div className="h-screen bg-background text-foreground">
      <div className="flex h-screen overflow-hidden app-shell">
        {isMobileNavOpen ? (
          <div
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setIsMobileNavOpen(false)}
          />
        ) : null}
        <aside
          className={`fixed left-0 top-0 z-40 h-screen w-72 shrink-0 app-sidebar transition-transform lg:static lg:translate-x-0 lg:mx-4 lg:my-4 lg:h-[calc(100vh-2rem)] lg:rounded-3xl ${
            isMobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="flex h-full flex-col px-4 py-6">
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {t("app.name")}
              </span>
              <button
                type="button"
                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:text-foreground"
                onClick={() => setIsMobileNavOpen(false)}
              >
                {t("common.close")}
              </button>
            </div>
            <div className="rounded-2xl px-4 py-4 text-primary-contrast shadow-sm brand-card">
              <p className="text-xs uppercase tracking-[0.2em] text-primary-contrast opacity-70">
                {t("app.name")}
              </p>
              <p className="mt-2 text-sm font-semibold">{t("app.tagline")}</p>
              <div className="mt-3 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
                {t(`role.${activeRole}`)}
              </div>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto pr-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted nav-heading">
                {t("nav.section")}
              </p>
              <div className="space-y-1 nav-group">
                <NavLink href="/dashboard" label={t("nav.dashboard")} icon={Icon.dashboard} />
                {allowedModules.includes("notifications") ? (
                  <NavLink
                    href="/notifications"
                    label={t("nav.notifications")}
                    icon={Icon.bell}
                    badgeCount={unreadCount}
                  />
                ) : null}
                {hasModule("accounting") && allowedModules.includes("sales") ? (
                  <NavLink href="/sales" label={t("nav.sales")} icon={Icon.sales} />
                ) : null}
                {hasModule("accounting") && allowedModules.includes("purchases") ? (
                  <NavLink href="/purchases" label={t("nav.purchases")} icon={Icon.purchases} />
                ) : null}
                {hasModule("payments") && allowedModules.includes("payments") ? (
                  <NavLink href="/payments" label={t("nav.payments")} icon={Icon.payments} />
                ) : null}
                {hasModule("inventory") && allowedModules.includes("items") ? (
                  <NavLink href="/items" label={t("nav.items")} icon={Icon.items} />
                ) : null}
                {allowedModules.includes("documents") ? (
                  <NavLink href="/documents" label={t("nav.documents")} icon={Icon.documents} />
                ) : null}
                {hasModule("hr") && allowedModules.includes("hr") ? (
                  <NavLink href="/hr" label={t("nav.hr")} icon={Icon.hr} />
                ) : null}
                {hasModule("reports") && allowedModules.includes("reports") ? (
                  <NavLink href="/reports" label={t("nav.reports")} icon={Icon.reports} />
                ) : null}
                {allowedModules.includes("support") ? (
                  <NavLink href="/support" label={t("nav.support")} icon={Icon.support} />
                ) : null}
                {allowedModules.includes("help") ? (
                  <NavLink href="/help" label={t("nav.help")} icon={Icon.help} />
                ) : null}
                {allowedModules.includes("developers") ? (
                  <NavLink href="/developers" label={t("nav.developers")} icon={Icon.developers} />
                ) : null}
                {["owner", "admin"].includes(activeRole) ? (
                  <NavLink
                    href="/admin/registrations"
                    label={t("admin.registrations.title")}
                    icon={Icon.admin}
                    badgeCount={pendingRegistrationsCount}
                  />
                ) : null}
                {allowedModules.includes("settings") ? (
                  <NavLink href="/settings" label={t("nav.settings")} icon={Icon.settings} />
                ) : null}
                {isSystemAdmin && allowedModules.includes("admin") ? (
                  <NavLink href="/admin" label={t("nav.admin")} icon={Icon.admin} />
                ) : null}
              </div>
            </div>
            <div className="mt-4 app-panel px-3 py-3 text-xs text-muted">
              {t("app.tagline")}
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="mx-4 mt-4 flex flex-col gap-3">
            <header className="sticky top-0 z-20 flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-4 app-header">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted shadow-sm transition hover:text-foreground lg:hidden header-action"
                  onClick={() => setIsMobileNavOpen(true)}
                  aria-label="Open navigation"
                >
                  <span className="text-lg">☰</span>
                </button>
                <div className="header-pill">
                  <CompanySwitcher />
                </div>
                <div className="header-pill">
                  <LanguageSwitcher />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="select-none text-xs text-transparent">Notifications</span>
                  <button
                    type="button"
                    className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted shadow-sm transition hover:text-foreground header-action"
                    onClick={() => router.push("/notifications")}
                    aria-label={t("nav.notifications")}
                  >
                    <span className="h-5 w-5">{Icon.bell}</span>
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <div className={`flex items-center gap-4 text-sm ${alignClass}`}>
                <div className="topbar-user">
                  <div className="topbar-avatar">
                    {(data?.user?.name ?? t("common.user")).slice(0, 1).toUpperCase()}
                  </div>
                  <div className={alignClass}>
                    <p className="font-semibold">{data?.user?.name ?? t("common.user")}</p>
                    <p className="text-xs text-muted">{data?.user?.email ?? ""}</p>
                    <div className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide app-badge">
                      {t(`role.${activeRole}`)}
                    </div>
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

            {impersonation ? (
              <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-700 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t("impersonation.banner", {
                      name: impersonation.targetName ?? t("common.user"),
                      email: impersonation.targetEmail ?? t("common.na"),
                      admin: impersonation.adminEmail ?? t("common.na"),
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch("/api/admin/impersonate/end", { method: "POST" });
                      window.location.reload();
                    }}
                    className="cursor-pointer rounded-lg border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    {t("impersonation.end")}
                  </button>
                </div>
              </div>
            ) : null}

            {showTenantBanner ? (
              <div className="tenant-banner w-full">
                <span className="tenant-icon">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <path d="M9 22V12h6v10" />
                  </svg>
                </span>
                <span className="font-semibold text-foreground">
                  {t("labels.tenantContext", {
                    company: activeCompany?.name ?? t("common.na"),
                    role: t(`role.${activeCompany?.role ?? "viewer"}`),
                  })}
                </span>
              </div>
            ) : null}
          </div>

          <main className="flex-1 overflow-y-auto px-6 py-10 app-main">{children}</main>
        </div>
      </div>
    </div>
  );
}
