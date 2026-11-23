"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { CompanySwitcher } from "@/components/company-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NavIcon, type NavIconName } from "@/components/nav-icons";
import { NavLink, type NavChild } from "@/components/nav-link";
import { useCompany } from "@/components/company-provider";
import { useNotifications } from "@/components/notifications-provider";
import { useTranslations } from "@/i18n/provider";
import { disablePush } from "@/lib/notifications/client";
import { canAccessPath, getAllowedModules, type AppModule } from "@/lib/permissions";

const PENDING_REFRESH_MS = 60_000;

type NavEntry = {
  href: string;
  label: string;
  icon: NavIconName;
  module: AppModule;
  planModule?: string;
  items?: NavChild[];
  excludes?: string[];
  badgeCount?: number;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  const { t } = useTranslations();
  const { activeCompany, activeCompanyId } = useCompany();
  const { unreadCount } = useNotifications();
  const activeRole = activeCompany?.role ?? "viewer";
  const isOwnerOrAdmin = activeRole === "owner" || activeRole === "admin";
  const [planModules, setPlanModules] = useState<string[] | null>(null);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const [impersonation, setImpersonation] = useState<{
    adminEmail?: string;
    targetEmail?: string;
    targetName?: string;
  } | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!activeCompanyId) return;
    fetch(`/api/billing/subscription?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((json) => setPlanModules(Array.isArray(json?.plan?.modules) ? json.plan.modules : null))
      .catch(() => setPlanModules(null));
  }, [activeCompanyId]);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((json) => setIsSystemAdmin(Boolean(json?.isSystemAdmin)))
      .catch(() => setIsSystemAdmin(false));
    fetch("/api/admin/impersonation")
      .then((res) => res.json())
      .then((json) => setImpersonation(json?.active && json.impersonation ? json.impersonation : null))
      .catch(() => setImpersonation(null));
  }, []);

  // Only owners can act on access requests; system admins use the admin console.
  const seesRegistrations = activeRole === "owner";
  useEffect(() => {
    if (!seesRegistrations) return;
    const refresh = () =>
      fetch(`/api/admin/registrations?status=pending&companyId=${activeCompanyId ?? ""}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((json) => setPendingRegistrations(Array.isArray(json?.requests) ? json.requests.length : 0))
        .catch(() => setPendingRegistrations(0));
    refresh();
    const timer = window.setInterval(refresh, PENDING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [seesRegistrations, activeCompanyId, unreadCount]);

  useEffect(() => {
    if (pathname && !canAccessPath(activeRole, pathname)) {
      router.replace("/dashboard");
    }
  }, [pathname, activeRole, router]);

  useEffect(() => {
    setIsMobileNavOpen(false);
    setIsUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [isUserMenuOpen]);

  const allowedModules = useMemo(() => getAllowedModules(activeRole), [activeRole]);
  const isEmployee = activeRole === "employee";

  const groups: Array<{ label: string; entries: NavEntry[] }> = [
    {
      label: t("nav.group.overview"),
      entries: [
        { href: "/dashboard", label: t("nav.dashboard"), icon: "dashboard", module: "dashboard" },
        { href: "/notifications", label: t("nav.notifications"), icon: "bell", module: "notifications", badgeCount: unreadCount },
      ],
    },
    {
      label: t("nav.group.finance"),
      entries: [
        {
          href: "/sales", label: t("nav.sales"), icon: "sales", module: "sales", planModule: "accounting",
          items: [
            { href: "/sales/invoices", label: t("sales.invoicesCardTitle") },
            { href: "/sales/customers", label: t("sales.customersCardTitle") },
            { href: "/sales/credit-notes", label: t("sales.creditNotesCardTitle") },
            { href: "/sales/debit-notes", label: t("debitNote.title") },
            { href: "/sales/recurring", label: t("sales.recurringCardTitle") },
          ],
        },
        {
          href: "/purchases", label: t("nav.purchases"), icon: "purchases", module: "purchases", planModule: "accounting",
          items: [
            { href: "/purchases/bills", label: t("purchases.billsCardTitle") },
            { href: "/purchases/vendors", label: t("purchases.vendorsCardTitle") },
            { href: "/purchases/expenses", label: t("purchases.expensesCardTitle") },
            { href: "/purchases/expense-categories", label: t("purchases.expenseCategoriesCardTitle") },
            { href: "/purchases/vendor-credit-notes", label: t("purchases.creditNotesCardTitle") },
          ],
        },
        {
          href: "/payments", label: t("nav.payments"), icon: "payments", module: "payments", planModule: "payments",
          items: [
            { href: "/payments/receipts", label: t("payments.receiptsCardTitle") },
            { href: "/payments/vendor-payments", label: t("payments.vendorPaymentsCardTitle") },
            { href: "/payments/accounts", label: t("payments.accountsCardTitle") },
            { href: "/payments/methods", label: t("payments.methodsCardTitle") },
            { href: "/payments/transfers", label: t("payments.transfersCardTitle") },
            { href: "/payments/adjustments", label: t("payments.adjustmentsCardTitle") },
            { href: "/payments/reconciliation", label: t("payments.reconciliationCardTitle") },
          ],
        },
        { href: "/items", label: t("nav.items"), icon: "items", module: "items", planModule: "inventory" },
        {
          href: "/reports", label: t("nav.reports"), icon: "reports", module: "reports", planModule: "reports",
          items: [
            { href: "/reports/profit-loss", label: t("reports.profitLossCardTitle") },
            { href: "/reports/balance-sheet", label: t("reports.balanceSheetCardTitle") },
            { href: "/reports/cash-flow", label: t("reports.cashFlowCardTitle") },
            { href: "/reports/trial-balance", label: t("reports.trialBalanceCardTitle") },
            { href: "/reports/general-ledger", label: t("reports.ledgerCardTitle") },
            { href: "/reports/vat", label: t("reports.vatCardTitle") },
            { href: "/reports/exports", label: t("reports.exportCenterCardTitle") },
          ],
        },
      ],
    },
    {
      label: t("nav.group.people"),
      entries: [
        {
          href: "/hr", label: t("nav.hr"), icon: "hr", module: "hr", planModule: "hr",
          items: isEmployee
            ? [
                { href: "/hr/attendance", label: t("dashboard.link.attendance") },
                { href: "/hr/leave", label: t("dashboard.link.leave") },
                { href: "/hr/my-profile", label: t("hr.self.title") },
              ]
            : [
                { href: "/hr/employees", label: t("hr.employees.title") },
                { href: "/hr/attendance", label: t("dashboard.link.attendance") },
                { href: "/hr/leave", label: t("dashboard.link.leave") },
                { href: "/hr/payroll", label: t("dashboard.link.payroll") },
                { href: "/hr/departments", label: t("hr.departments.title") },
                { href: "/hr/positions", label: t("hr.positions.title") },
                { href: "/hr/reports", label: t("hr.reports.title") },
              ],
        },
        { href: "/documents", label: t("nav.documents"), icon: "documents", module: "documents" },
      ],
    },
    {
      label: t("nav.group.workspace"),
      entries: [
        { href: "/settings/integrations", label: t("nav.integrations"), icon: "integrations", module: "settings" },
        { href: "/developers", label: t("nav.developers"), icon: "developers", module: "developers" },
        ...(seesRegistrations
          ? [{
              href: "/admin/registrations", label: t("admin.registrations.title"), icon: "requests" as const,
              module: "admin" as const, badgeCount: pendingRegistrations,
            }]
          : []),
        {
          href: "/settings", label: t("nav.settings"), icon: "settings", module: "settings",
          excludes: ["/settings/integrations"],
        },
        { href: "/support", label: t("nav.support"), icon: "support", module: "support" },
        { href: "/help", label: t("nav.help"), icon: "help", module: "help" },
        ...(isSystemAdmin
          ? [{
              href: "/admin", label: t("nav.admin"), icon: "admin" as const, module: "admin" as const,
              excludes: ["/admin/registrations"],
            }]
          : []),
      ],
    },
  ];

  const isVisible = (entry: NavEntry) =>
    allowedModules.includes(entry.module) &&
    (!entry.planModule || !planModules?.length || planModules.includes(entry.planModule)) &&
    canAccessPath(activeRole, entry.href);

  const userName = data?.user?.name ?? t("common.user");

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
        <div className="flex h-16 items-center gap-3 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#6fb1ee] text-[#0b2239]" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
              <path d="M4 20V10l8-6 8 6v10H4Zm5 0v-5.5a3 3 0 0 1 6 0V20" />
            </svg>
          </span>
          <span className="truncate text-[15px] font-semibold text-white">{t("app.name")}</span>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2" aria-label={t("nav.section")}>
          {groups.map((group) => {
            const entries = group.entries.filter(isVisible);
            if (entries.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1.5 px-3 text-xs font-medium text-[#7f93a8]">{group.label}</p>
                <div className="space-y-0.5">
                  {entries.map((entry) => (
                    <NavLink
                      key={entry.href}
                      href={entry.href}
                      label={entry.label}
                      icon={entry.icon}
                      items={entry.items?.filter((item) => canAccessPath(activeRole, item.href))}
                      excludes={entry.excludes}
                      badgeCount={entry.badgeCount}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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
          <CompanySwitcher />
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher compact />
            <Link href="/notifications" className="icon-button relative" aria-label={t("nav.notifications")}>
              <NavIcon name="bell" className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -end-0.5 -top-0.5 min-w-4 rounded-full bg-[#d0453b] px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-md py-1 ps-1 pe-2 transition-colors hover:bg-surface-muted"
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                onClick={() => setIsUserMenuOpen((open) => !open)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dbe8f5] text-sm font-semibold text-[#0c447c]">
                  {userName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-40 text-start leading-tight sm:block">
                  <span className="block truncate text-sm font-medium">{userName}</span>
                  <span className="block truncate text-xs text-muted">{t(`role.${activeRole}`)}</span>
                </span>
              </button>
              {isUserMenuOpen ? (
                <div
                  role="menu"
                  className="absolute end-0 top-full z-30 mt-2 w-60 rounded-lg border border-border bg-surface py-1.5 shadow-lg"
                >
                  <p className="truncate border-b border-border px-4 pb-2.5 pt-1.5 text-xs text-muted" dir="ltr">
                    {data?.user?.email ?? ""}
                  </p>
                  <Link
                    role="menuitem"
                    href={isOwnerOrAdmin ? "/settings/security" : "/account"}
                    className="menu-item"
                  >
                    {t("nav.security")}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={async () => {
                      await disablePush().catch(() => undefined);
                      await fetch("/api/admin/impersonate/end", { method: "POST" }).catch(() => undefined);
                      await signOut({ callbackUrl: "/login" });
                    }}
                  >
                    {t("nav.signOut")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {impersonation ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-900">
            <span>
              {t("impersonation.banner", {
                name: impersonation.targetName ?? t("common.user"),
                email: impersonation.targetEmail ?? t("common.na"),
                admin: impersonation.adminEmail ?? t("common.na"),
              })}
            </span>
            <button
              type="button"
              className="font-semibold underline underline-offset-4"
              onClick={async () => {
                await fetch("/api/admin/impersonate/end", { method: "POST" });
                window.location.reload();
              }}
            >
              {t("impersonation.end")}
            </button>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
