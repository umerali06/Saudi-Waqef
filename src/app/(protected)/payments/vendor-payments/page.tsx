"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type VendorPaymentListItem = {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  vendorId: string;
  vendorName: string;
  method: string;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  currency: string;
};

type Vendor = {
  id: string;
  name: string;
};

export default function VendorPaymentsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [payments, setPayments] = useState<VendorPaymentListItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
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

  const loadPayments = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingPayments(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (vendorFilter !== "all") {
      params.set("vendorId", vendorFilter);
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
    fetch(`/api/payments/vendor-payments?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setPayments(data.payments ?? []))
      .catch(() => setPayments([]))
      .finally(() => setLoadingPayments(false));
  }, [activeCompanyId, fromDate, query, statusFilter, toDate, vendorFilter]);

  const loadVendors = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingVendors(true);
    fetch(`/api/vendors?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setVendors(data.vendors ?? []))
      .catch(() => setVendors([]))
      .finally(() => setLoadingVendors(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const statusOptions = useMemo(
    () => [
      { value: "unapplied", label: t("vendorPayment.status.unapplied") },
    ],
    [t]
  );

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("vendorPayment.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("vendorPayment.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/payments/vendor-payments/export?companyId=${activeCompanyId ?? ""}`}
            className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
          >
            {t("vendorPayment.exportCsv")}
          </a>
          <Link
            href="/payments/vendor-payments/new"
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("vendorPayment.create")}
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
              placeholder={t("vendorPayment.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("vendorPayment.statusFilter")}
            </span>
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
            <span className="mb-1 block text-xs text-muted">
              {t("vendorPayment.vendorFilter")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={vendorFilter}
              onChange={(event) => setVendorFilter(event.target.value)}
              disabled={loadingVendors}
            >
              <option value="all">{t("common.all")}</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorPayment.fromDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorPayment.toDate")}</span>
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
          <span>{t("vendorPayment.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingPayments ? "—" : payments.length}
          </span>
        </div>
        {loadingPayments ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("vendorPayment.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.vendor")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.method")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.total")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.applied")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.unapplied")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/payments/vendor-payments/${payment.id}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {payment.paymentNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{formatDate(payment.paymentDate)}</td>
                    <td className="px-4 py-2">{payment.vendorName}</td>
                    <td className="px-4 py-2">{formatMethod(payment.method)}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(payment.totalAmount, payment.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(payment.appliedAmount, payment.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(payment.unappliedAmount, payment.currency)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/payments/vendor-payments/${payment.id}`}
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
