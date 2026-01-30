"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type BillListItem = {
  id: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  vendorBillNumber?: string | null;
  status: string;
  billDate: string;
  dueDate: string;
  total: number;
  balance: number;
  currency: string;
};

type Vendor = {
  id: string;
  name: string;
};

export default function BillsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [bills, setBills] = useState<BillListItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
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

  const loadBills = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingBills(true);
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
    if (overdueOnly) {
      params.set("overdue", "true");
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/bills?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setBills(data.bills ?? []))
      .catch(() => setBills([]))
      .finally(() => setLoadingBills(false));
  }, [activeCompanyId, fromDate, overdueOnly, query, statusFilter, toDate, vendorFilter]);

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
    loadBills();
  }, [loadBills]);

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("bill.status.draft") },
      { value: "approved", label: t("bill.status.approved") },
      { value: "partially_paid", label: t("bill.status.partiallyPaid") },
      { value: "paid", label: t("bill.status.paid") },
      { value: "canceled", label: t("bill.status.canceled") },
    ],
    [t]
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("bill.title")}</h1>
          <p className="text-sm text-muted">{t("bill.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/bills/export?companyId=${activeCompanyId ?? ""}`}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
          >
            {t("bill.exportCsv")}
          </a>
          <Link
            href="/purchases/bills/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("bill.create")}
          </Link>
        </div>
      </div>

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("bill.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("bill.statusFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            <span className="mb-1 block text-xs text-muted">{t("bill.vendorFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            <span className="mb-1 block text-xs text-muted">{t("bill.fromDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("bill.toDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            {t("bill.overdueOnly")}
          </label>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("bill.listTitle")}</span>
          <span className="text-xs text-muted">{loadingBills ? "—" : bills.length}</span>
        </div>
        {loadingBills ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : bills.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("bill.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("bill.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("bill.vendor")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("bill.vendorBill")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.amount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.balance")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/purchases/bills/${bill.id}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {bill.billNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{bill.vendorName}</td>
                    <td className="px-4 py-2">{bill.vendorBillNumber ?? "-"}</td>
                    <td className="px-4 py-2">{formatDate(bill.billDate)}</td>
                    <td className="px-4 py-2">{formatDate(bill.dueDate)}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(bill.total, bill.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(bill.balance, bill.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {t(`bill.status.${bill.status ?? "draft"}`)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/purchases/bills/${bill.id}`}
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
