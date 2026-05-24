"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  balance: number;
  currency: string;
};

type Customer = {
  id: string;
  name: string;
};

export default function SalesInvoicesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || "SAR",
    }).format(value);

  const formatDate = (value: string) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
  };

  const loadInvoices = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingInvoices(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (customerFilter !== "all") {
      params.set("customerId", customerFilter);
    }
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }
    if (overdueOnly) {
      params.set("overdue", "true");
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/invoices?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setInvoices(data.invoices ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setLoadingInvoices(false));
  }, [activeCompanyId, customerFilter, fromDate, overdueOnly, query, statusFilter, toDate]);

  const loadCustomers = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingCustomers(true);
    fetch(`/api/customers?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers ?? []))
      .catch(() => setCustomers([]))
      .finally(() => setLoadingCustomers(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("invoice.status.draft") },
      { value: "approved", label: t("invoice.status.approved") },
      { value: "sent", label: t("invoice.status.sent") },
      { value: "partially_paid", label: t("invoice.status.partiallyPaid") },
      { value: "paid", label: t("invoice.status.paid") },
      { value: "canceled", label: t("invoice.status.canceled") },
    ],
    [t]
  );

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("invoice.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("invoice.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!activeCompanyId) return;
              setError(null);
              setNotice(null);
              startTransition(async () => {
                const response = await fetch("/api/invoices/reminders/overdue", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ companyId: activeCompanyId }),
                });
                if (!response.ok) {
                  setError("error.saveFailed");
                  return;
                }
                setNotice("invoice.remindersSent");
              });
            }}
            className="rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground"
            disabled={isPending}
          >
            {t("invoice.sendReminders")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeCompanyId) return;
              setError(null);
              setNotice(null);
              startTransition(async () => {
                const response = await fetch("/api/recurring-invoices/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ companyId: activeCompanyId }),
                });
                if (!response.ok) {
                  setError("error.saveFailed");
                  return;
                }
                setNotice("invoice.recurringRun");
                loadInvoices();
              });
            }}
            className="rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground"
            disabled={isPending}
          >
            {t("invoice.runRecurring")}
          </button>
          <Link
            href="/sales/invoices/new"
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("invoice.create")}
          </Link>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t(notice)}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(error)}
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("invoice.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("invoice.statusFilter")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("invoice.customerFilter")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              disabled={loadingCustomers}
            >
              <option value="all">{t("common.all")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("invoice.fromDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("invoice.toDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            {t("invoice.overdueOnly")}
          </label>
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("invoice.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingInvoices ? "—" : invoices.length}
          </span>
        </div>
        {loadingInvoices ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("invoice.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("invoice.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("invoice.customer")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.amount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.balance")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/sales/invoices/${invoice.id}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{invoice.customerName}</td>
                    <td className="px-4 py-2">{formatDate(invoice.invoiceDate)}</td>
                    <td className="px-4 py-2">{formatDate(invoice.dueDate)}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(invoice.balance, invoice.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {t(`invoice.status.${invoice.status ?? "draft"}`)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/sales/invoices/${invoice.id}`}
                        className="text-xs font-semibold text-foreground underline decoration-dotted"
                      >
                        {t("common.view")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
