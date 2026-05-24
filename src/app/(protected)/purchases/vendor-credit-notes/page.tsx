"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type CreditNoteListItem = {
  id: string;
  creditNumber: string;
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  status: "draft" | "issued" | "canceled";
  issueDate: string;
  total: number;
  currency: string;
};

type Vendor = {
  id: string;
  name: string;
};

export default function VendorCreditNotesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [creditNotes, setCreditNotes] = useState<CreditNoteListItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingCreditNotes, setLoadingCreditNotes] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
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

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("vendorCreditNote.status.draft") },
      { value: "issued", label: t("vendorCreditNote.status.issued") },
      { value: "canceled", label: t("vendorCreditNote.status.canceled") },
    ],
    [t]
  );

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

  const loadCreditNotes = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingCreditNotes(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (vendorFilter !== "all") {
      params.set("vendorId", vendorFilter);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/vendor-credit-notes?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setCreditNotes(data.creditNotes ?? []))
      .catch(() => setCreditNotes([]))
      .finally(() => setLoadingCreditNotes(false));
  }, [activeCompanyId, query, statusFilter, vendorFilter]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    loadCreditNotes();
  }, [loadCreditNotes]);

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("vendorCreditNote.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("vendorCreditNote.subtitle")}</p>
        </div>
        <Link
          href="/purchases/vendor-credit-notes/new"
          className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
        >
          {t("vendorCreditNote.create")}
        </Link>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("vendorCreditNote.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorCreditNote.statusFilter")}</span>
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
            <span className="mb-1 block text-xs text-muted">{t("vendorCreditNote.vendorFilter")}</span>
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
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("vendorCreditNote.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingCreditNotes ? "—" : creditNotes.length}
          </span>
        </div>
        {loadingCreditNotes ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : creditNotes.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("vendorCreditNote.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorCreditNote.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorCreditNote.bill")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorCreditNote.vendor")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorCreditNote.issueDate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.amount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creditNotes.map((note) => (
                  <tr key={note.id}>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/purchases/vendor-credit-notes/${note.id}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {note.creditNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{note.billNumber}</td>
                    <td className="px-4 py-2">{note.vendorName}</td>
                    <td className="px-4 py-2">{formatDate(note.issueDate)}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(note.total, note.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {t(`vendorCreditNote.status.${note.status ?? "draft"}`)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/purchases/vendor-credit-notes/${note.id}`}
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
