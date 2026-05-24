"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type ReceiptListItem = {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  customerId: string;
  customerName: string;
  method: string;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  currency: string;
};

type Customer = {
  id: string;
  name: string;
};

export default function ReceiptsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [receipts, setReceipts] = useState<ReceiptListItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");

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
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
    }).format(date);
  };

  const formatMethod = (value: string) => {
    if (!value) {
      return "-";
    }
    const key = `payment.method.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  const loadReceipts = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingReceipts(true);
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
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/payments/receipts?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setReceipts(data.receipts ?? []))
      .catch(() => setReceipts([]))
      .finally(() => setLoadingReceipts(false));
  }, [activeCompanyId, customerFilter, fromDate, query, statusFilter, toDate]);

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
    loadReceipts();
  }, [loadReceipts]);

  const statusOptions = useMemo(
    () => [
      { value: "unapplied", label: t("receipt.status.unapplied") },
    ],
    [t]
  );

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("receipt.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("receipt.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/payments/receipts/export?companyId=${activeCompanyId ?? ""}`}
            className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
          >
            {t("receipt.exportCsv")}
          </a>
          <Link
            href="/payments/receipts/new"
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("receipt.create")}
          </Link>
        </div>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-5">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("receipt.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("receipt.statusFilter")}</span>
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
            <span className="mb-1 block text-xs text-muted">{t("receipt.customerFilter")}</span>
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
            <span className="mb-1 block text-xs text-muted">{t("receipt.fromDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("receipt.toDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("receipt.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingReceipts ? "—" : receipts.length}
          </span>
        </div>
        {loadingReceipts ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("receipt.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.customer")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.method")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.total")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.applied")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.unapplied")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/payments/receipts/${receipt.id}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {receipt.receiptNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{formatDate(receipt.receiptDate)}</td>
                    <td className="px-4 py-2">{receipt.customerName}</td>
                    <td className="px-4 py-2">{formatMethod(receipt.method)}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(receipt.totalAmount, receipt.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(receipt.appliedAmount, receipt.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(receipt.unappliedAmount, receipt.currency)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/payments/receipts/${receipt.id}`}
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
