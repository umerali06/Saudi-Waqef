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
      router.replace("/");
    }
  }, [pathname, activeCompany?.role, router]);

  return (
    <div className="h-screen bg-background text-foreground">
      <div className="flex h-screen overflow-hidden">
        {isMobileNavOpen ? (
          <div
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setIsMobileNavOpen(false)}
          />
        ) : null}
        <aside
          className={`fixed left-0 top-0 z-40 h-screen w-72 shrink-0 border-e border-border bg-surface shadow-sm transition-transform lg:static lg:translate-x-0 ${
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
            <div className="rounded-2xl bg-primary px-4 py-4 text-primary-contrast shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-primary-contrast opacity-70">
                {t("app.name")}
              </p>
              <p className="mt-2 text-sm font-semibold">{t("app.tagline")}</p>
              <div className="mt-3 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
                {t(`role.${activeRole}`)}
              </div>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto pr-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                {t("nav.section")}
              </p>
              <div className="space-y-1">
                <NavLink href="/" label={t("nav.dashboard")} />
                {allowedModules.includes("notifications") ? (
                  <NavLink href="/notifications" label={t("nav.notifications")} />
                ) : null}
                {hasModule("accounting") && allowedModules.includes("sales") ? (
                  <NavLink href="/sales" label={t("nav.sales")} />
                ) : null}
                {hasModule("accounting") && allowedModules.includes("purchases") ? (
                  <NavLink href="/purchases" label={t("nav.purchases")} />
                ) : null}
                {hasModule("payments") && allowedModules.includes("payments") ? (
                  <NavLink href="/payments" label={t("nav.payments")} />
                ) : null}
                {hasModule("inventory") && allowedModules.includes("items") ? (
                  <NavLink href="/items" label={t("nav.items")} />
                ) : null}
                {allowedModules.includes("documents") ? (
                  <NavLink href="/documents" label={t("nav.documents")} />
                ) : null}
                {hasModule("hr") && allowedModules.includes("hr") ? (
                  <NavLink href="/hr" label={t("nav.hr")} />
                ) : null}
                {hasModule("reports") && allowedModules.includes("reports") ? (
                  <NavLink href="/reports" label={t("nav.reports")} />
                ) : null}
                {allowedModules.includes("support") ? (
                  <NavLink href="/support" label={t("nav.support")} />
                ) : null}
                {allowedModules.includes("help") ? (
                  <NavLink href="/help" label={t("nav.help")} />
                ) : null}
                {allowedModules.includes("developers") ? (
                  <NavLink href="/developers" label={t("nav.developers")} />
                ) : null}
                {allowedModules.includes("settings") ? (
                  <NavLink href="/settings" label={t("nav.settings")} />
                ) : null}
                {isSystemAdmin && allowedModules.includes("admin") ? (
                  <NavLink href="/admin" label={t("nav.admin")} />
                ) : null}
              </div>
            </div>
            <div className="mt-4 app-panel px-3 py-3 text-xs text-muted">
              {t("app.tagline")}
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted shadow-sm transition hover:text-foreground lg:hidden"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open navigation"
              >
                <span className="text-lg">☰</span>
              </button>
              <CompanySwitcher />
              <LanguageSwitcher />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-transparent select-none">Notifications</span>
                <button
                  type="button"
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted shadow-sm transition hover:text-foreground"
                  onClick={() => router.push("/notifications")}
                  aria-label={t("nav.notifications")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
            <div className={`flex items-center gap-4 text-sm ${alignClass}`}>
              <div className={`${alignClass}`}>
                <p className="font-semibold">
                  {data?.user?.name ?? t("common.user")}
                </p>
                <p className="text-xs text-muted">{data?.user?.email ?? ""}</p>
                <div className="mt-1 inline-flex items-center rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {t(`role.${activeRole}`)}
                </div>
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

          {impersonation ? (
            <div className="border-b border-border bg-amber-50 px-6 py-2 text-xs text-amber-700">
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
            <div className="border-b border-border bg-surface-muted px-6 py-2 text-xs text-muted">
              {t("labels.tenantContext", {
                company: activeCompany?.name ?? t("common.na"),
                role: t(`role.${activeCompany?.role ?? "viewer"}`),
              })}
            </div>
          ) : null}

          <main className="flex-1 overflow-y-auto px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
