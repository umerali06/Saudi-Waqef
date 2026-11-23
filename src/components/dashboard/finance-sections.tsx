"use client";

import { createContext, useContext, useMemo, type ComponentProps } from "react";
import Link from "next/link";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";
import { AGING_BUCKETS } from "@/lib/reports/dashboard-metrics";
import type { DashboardFinance, SetupStep } from "@/lib/reports/dashboard";
import type { Role } from "@/lib/types";

const PreviewContext = createContext(false);

/** Shows the dashboard to visitors, whose clicks and prefetches must lead nowhere. */
export const DashboardPreview = PreviewContext.Provider;

function DashLink({ href, className, children }: Pick<ComponentProps<typeof Link>, "className" | "children"> & { href: string }) {
  return useContext(PreviewContext) ? (
    <span className={`block ${className ?? ""}`}>{children}</span>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

const SETUP_LINKS: Record<SetupStep, string> = {
  company: "/settings/company-profile",
  accounts: "/settings/accounting-defaults",
  tax: "/settings/accounting-defaults",
  branding: "/settings/document-branding",
  zatca: "/settings/integrations/zatca",
};

const AGING_TONE: Record<(typeof AGING_BUCKETS)[number], string> = {
  current: "bg-[#8fb8dd]",
  d30: "bg-[#5b95cb]",
  d60: "bg-[#2f75b3]",
  d90: "bg-[#155089]",
  older: "bg-[#0c3157]",
};

const STATUS_TONE: Record<string, string> = {
  draft: "status-neutral",
  approved: "status-info",
  sent: "status-info",
  partially_paid: "status-warn",
  paid: "status-good",
  canceled: "status-bad",
};

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex flex-col ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

export const PanelLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <DashLink href={href} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
    {children}
  </DashLink>
);

export function FinanceSections({
  finance,
  currency,
  role,
}: {
  finance: DashboardFinance;
  currency: string;
  role: Role | null;
}) {
  const { t } = useTranslations();
  const { formatCurrency, formatNumber, formatPercent, formatDate } = useLocaleFormatters({ currency });
  const { accounting, details } = finance.overview;
  const canManage = role === "owner" || role === "admin";
  const profit = accounting.revenue - accounting.expenses;
  const margin = accounting.revenue > 0 ? profit / accounting.revenue : null;

  const trend = (
    value: { percent: number | null },
    goodDirection: 1 | -1
  ): { text: string; tone: string } => {
    if (value.percent === null) return { text: t("analytics.trend.noBaseline"), tone: "text-muted" };
    const amount = formatNumber(Math.abs(value.percent), { maximumFractionDigits: 1 });
    if (value.percent === 0) return { text: t("analytics.trend.flat", { value: amount }), tone: "text-muted" };
    return {
      text: t(value.percent > 0 ? "analytics.trend.up" : "analytics.trend.down", { value: amount }),
      tone: Math.sign(value.percent) === goodDirection ? "text-[#0f7a52]" : "text-[#b3372f]",
    };
  };
  const revenueTrend = trend(accounting.revenueTrend, 1);
  const expenseTrend = trend(accounting.expensesTrend, -1);

  const position = [
    { label: t("dashboard.revenue"), value: accounting.revenue, note: revenueTrend.text, tone: revenueTrend.tone, href: "/sales/invoices" },
    { label: t("dashboard.expenses"), value: accounting.expenses, note: expenseTrend.text, tone: expenseTrend.tone, href: "/purchases" },
    {
      label: t("dashboard.profit"),
      value: profit,
      note: margin === null ? t("dashboard.noMargin") : t("dashboard.margin", { value: formatPercent(margin) }),
      tone: profit < 0 ? "text-[#b3372f]" : "text-muted",
      href: "/reports/profit-loss",
    },
    {
      label: t("analytics.kpi.cashBalance"),
      value: accounting.cashBalance,
      note: t("dashboard.netFlow", { value: formatCurrency(accounting.netCashFlow) }),
      tone: accounting.netCashFlow < 0 ? "text-[#b3372f]" : "text-muted",
      href: "/payments/accounts",
    },
  ];

  const pendingSetup = useMemo(
    () => (Object.keys(finance.setup) as SetupStep[]).filter((step) => !finance.setup[step]),
    [finance.setup]
  );
  const topExpense = Math.max(...details.expenseCategories.map((row) => row.total), 1);

  return (
    <>
      <div className="panel grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
        {position.map((item, index) => (
          <DashLink
            key={item.label}
            href={item.href}
            className={`group px-5 py-5 transition-colors hover:bg-surface-muted ${
              index > 0 ? "xl:border-s xl:border-border" : ""
            } ${index % 2 === 1 ? "sm:border-s sm:border-border" : ""} ${
              index > 1 ? "sm:border-t sm:border-border xl:border-t-0" : ""
            }`}
          >
            <p className="text-xs font-medium text-muted">{item.label}</p>
            <p className="mt-2 text-[1.6rem] font-semibold leading-tight tracking-tight tabular-nums">
              {formatCurrency(item.value)}
            </p>
            <p className={`mt-1.5 text-xs ${item.tone}`}>{item.note}</p>
          </DashLink>
        ))}
      </div>

      {canManage && pendingSetup.length > 0 ? (
        <section className="panel border-s-4 border-s-primary p-5">
          <h2 className="text-sm font-semibold">
            {t("dashboard.setup.title", { count: formatNumber(pendingSetup.length) })}
          </h2>
          <ul className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
            {pendingSetup.map((step) => (
              <li key={step}>
                <DashLink
                  href={SETUP_LINKS[step]}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {t(`dashboard.setup.${step}`)}
                </DashLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title={t("dashboard.trendTitle")}
          className="lg:col-span-2"
          action={<PanelLink href="/reports/profit-loss">{t("reports.profitLossCardTitle")}</PanelLink>}
        >
          <TrendChart points={finance.trend} currency={currency} />
        </Panel>

        <Panel
          title={t("dashboard.vat.title")}
          action={<PanelLink href="/reports/vat">{t("dashboard.open")}</PanelLink>}
        >
          {finance.vat ? (
            <div className="flex h-full flex-col">
              <p className="text-xs text-muted">
                {finance.vat.periodName} ({formatDate(finance.vat.startDate)} - {formatDate(finance.vat.endDate)})
              </p>
              <dl className="mt-4 space-y-3 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("analytics.kpi.vatOutput")}</dt>
                  <dd>{formatCurrency(finance.vat.outputVat)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("analytics.kpi.vatInput")}</dt>
                  <dd>({formatCurrency(finance.vat.inputVat)})</dd>
                </div>
                <div className="flex justify-between gap-3 border-t-2 border-foreground/80 pt-3 text-base font-semibold">
                  <dt>{finance.vat.netVat >= 0 ? t("dashboard.vat.payable") : t("dashboard.vat.refundable")}</dt>
                  <dd>{formatCurrency(Math.abs(finance.vat.netVat))}</dd>
                </div>
              </dl>
              <p
                className={`mt-auto pt-5 text-sm ${
                  finance.vat.daysLeft < 0 ? "font-semibold text-[#b3372f]" : "text-muted"
                }`}
              >
                {finance.vat.daysLeft < 0
                  ? t("dashboard.vat.overdue", { date: formatDate(finance.vat.dueDate) })
                  : t("dashboard.vat.due", {
                      date: formatDate(finance.vat.dueDate),
                      days: formatNumber(finance.vat.daysLeft),
                    })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {t("dashboard.vat.none")} <PanelLink href="/reports/vat">{t("dashboard.vat.create")}</PanelLink>
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title={t("dashboard.receivables.title")}
          className="lg:col-span-2"
          action={<PanelLink href="/sales/invoices">{t("dashboard.open")}</PanelLink>}
        >
          <p className="text-xl font-semibold tabular-nums">{formatCurrency(finance.receivables.total)}</p>
          {finance.receivables.total > 0 ? (
            <>
              <div className="mt-4 flex h-5 gap-[2px] overflow-hidden rounded-[4px]" aria-hidden>
                {AGING_BUCKETS.filter((bucket) => finance.receivables.buckets[bucket] > 0).map((bucket) => (
                  <span
                    key={bucket}
                    className={AGING_TONE[bucket]}
                    style={{ flexGrow: finance.receivables.buckets[bucket], minWidth: 3 }}
                    title={`${t(`dashboard.aging.${bucket}`)}: ${formatCurrency(finance.receivables.buckets[bucket])}`}
                  />
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
                {AGING_BUCKETS.map((bucket) => (
                  <div key={bucket}>
                    <dt className="flex items-center gap-1.5 text-xs text-muted">
                      <span className={`h-2 w-2 rounded-[2px] ${AGING_TONE[bucket]}`} aria-hidden />
                      {t(`dashboard.aging.${bucket}`)}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">
                      {formatCurrency(finance.receivables.buckets[bucket])}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("dashboard.receivables.none")}</p>
          )}
          {details.overdueInvoices.length > 0 ? (
            <table className="mt-5 w-full text-sm">
              <caption className="mb-2 text-start text-xs font-medium text-muted">
                {t("analytics.table.overdueTitle")}
              </caption>
              <tbody className="divide-y divide-border border-t border-border">
                {details.overdueInvoices.slice(0, 4).map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="py-2.5">
                      <DashLink href={`/sales/invoices/${invoice.id}`} className="font-medium hover:text-primary">
                        {invoice.invoiceNumber}
                      </DashLink>
                    </td>
                    <td className="max-w-40 truncate py-2.5 text-muted">{invoice.customerName}</td>
                    <td className="py-2.5 text-[#b3372f]">{formatDate(invoice.dueDate)}</td>
                    <td className="py-2.5 text-end tabular-nums">{formatCurrency(invoice.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Panel>

        <EInvoicingPanel finance={finance} canManage={canManage} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title={t("dashboard.recentInvoices")}
          className="lg:col-span-2"
          action={<PanelLink href="/sales/invoices">{t("dashboard.viewAll")}</PanelLink>}
        >
          {finance.recentInvoices.length > 0 ? (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <tbody className="divide-y divide-border">
                  {finance.recentInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-surface-muted">
                      <td className="px-5 py-3">
                        <DashLink href={`/sales/invoices/${invoice.id}`} className="font-medium hover:text-primary">
                          {invoice.invoiceNumber}
                        </DashLink>
                      </td>
                      <td className="max-w-52 truncate py-3 text-muted">{invoice.customerName}</td>
                      <td className="py-3 text-muted">{formatDate(invoice.invoiceDate)}</td>
                      <td className="py-3">
                        <span className={`status ${STATUS_TONE[invoice.status] ?? "status-neutral"}`}>
                          {t(`invoice.status.${invoice.status}`)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-end font-medium tabular-nums">
                        {formatCurrency(invoice.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {t("dashboard.recentInvoices.none")}{" "}
              <PanelLink href="/sales/invoices/new">{t("dashboard.newInvoice")}</PanelLink>
            </p>
          )}
        </Panel>

        <Panel
          title={t("dashboard.payables.title")}
          action={<PanelLink href="/purchases/bills">{t("dashboard.open")}</PanelLink>}
        >
          <dl className="space-y-2.5 text-sm tabular-nums">
            {(
              [
                ["total", finance.payables.total, ""],
                ["overdue", finance.payables.overdue, finance.payables.overdue > 0 ? "text-[#b3372f]" : ""],
                ["next7", finance.payables.next7, ""],
              ] as const
            ).map(([key, value, tone]) => (
              <div key={key} className={`flex justify-between gap-3 ${tone}`}>
                <dt className={tone || "text-muted"}>{t(`dashboard.payables.${key}`)}</dt>
                <dd className="font-medium">{formatCurrency(value)}</dd>
              </div>
            ))}
          </dl>
          {finance.payables.bills.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-t border-border text-sm">
              {finance.payables.bills.map((bill) => (
                <li key={bill.id}>
                  <DashLink
                    href={`/purchases/bills/${bill.id}`}
                    className="flex items-baseline justify-between gap-3 py-2.5 hover:text-primary"
                  >
                    <span className="min-w-0 truncate">
                      {bill.vendorName}
                      <span className="ms-2 text-xs text-muted">{formatDate(bill.dueDate)}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(bill.balance)}</span>
                  </DashLink>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>

      {details.expenseCategories.length > 0 || details.topCustomers.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title={t("analytics.table.topCustomers")}>
            {details.topCustomers.length > 0 ? (
              <ol className="-my-2.5 divide-y divide-border text-sm">
                {details.topCustomers.slice(0, 5).map((customer) => (
                  <li key={customer.customerId}>
                    <DashLink
                      href={`/sales/customers/${customer.customerId}`}
                      className="flex justify-between gap-3 py-2.5 hover:text-primary"
                    >
                      <span className="truncate">{customer.customerName}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatCurrency(customer.total)}</span>
                    </DashLink>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">{t("analytics.table.empty")}</p>
            )}
          </Panel>
          <Panel title={t("analytics.table.expenseCategories")}>
            {details.expenseCategories.length > 0 ? (
              <ul className="space-y-3.5 text-sm">
                {details.expenseCategories.slice(0, 5).map((row) => (
                  <li key={row.categoryId}>
                    <div className="flex justify-between gap-3">
                      <span className="truncate">{row.categoryName}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatCurrency(row.total)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5">
                      <div
                        className="h-full rounded-e-[4px] bg-series-2"
                        style={{ width: `${(row.total / topExpense) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t("analytics.table.empty")}</p>
            )}
          </Panel>
        </div>
      ) : null}
    </>
  );
}

function EInvoicingPanel({ finance, canManage }: { finance: DashboardFinance; canManage: boolean }) {
  const { t } = useTranslations();
  const { formatNumber } = useLocaleFormatters();
  const { einvoicing } = finance;
  const rows = [
    ["filed", einvoicing.filed, "status-good"],
    ["pending", einvoicing.pending, "status-warn"],
    ["rejected", einvoicing.rejected, einvoicing.rejected > 0 ? "status-bad" : "status-neutral"],
    ["unsent", einvoicing.unsent, einvoicing.unsent > 0 ? "status-warn" : "status-neutral"],
  ] as const;

  return (
    <Panel
      title={t("dashboard.zatca.title")}
      action={
        einvoicing.environment ? (
          <span
            className={`status ${
              einvoicing.ready && einvoicing.environment === "production" ? "status-good" : "status-info"
            }`}
          >
            {t(`integrations.zatca.environment.${einvoicing.environment}`)}
          </span>
        ) : null
      }
    >
      {einvoicing.ready ? (
        <ul className="divide-y divide-border text-sm">
          {rows.map(([key, value, tone]) => (
            <li key={key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
              <span className="text-muted">{t(`dashboard.zatca.${key}`)}</span>
              <span className={`status ${tone} tabular-nums`}>{formatNumber(value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {einvoicing.environment ? t("dashboard.zatca.incomplete") : t("dashboard.zatca.notStarted")}
        </p>
      )}
      {einvoicing.lastError ? (
        <p className="mt-3 rounded-md bg-[#fbeceb] px-3 py-2 text-xs text-[#8f2a23]">
          {t("dashboard.zatca.needsAttention")}
        </p>
      ) : null}
      {canManage ? (
        <DashLink href="/settings/integrations/zatca" className="btn-secondary mt-4 w-full justify-center">
          {einvoicing.ready ? t("dashboard.zatca.manage") : t("dashboard.zatca.setup")}
        </DashLink>
      ) : null}
    </Panel>
  );
}
