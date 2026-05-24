"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type CreditNoteListItem = {
  id: string;
  creditNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  status: "draft" | "issued" | "canceled";
  issueDate: string;
  total: number;
  currency: string;
};

type Customer = {
  id: string;
  name: string;
};

export default function CreditNotesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [creditNotes, setCreditNotes] = useState<CreditNoteListItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCreditNotes, setLoadingCreditNotes] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
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
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
  };

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("creditNote.status.draft") },
      { value: "issued", label: t("creditNote.status.issued") },
      { value: "canceled", label: t("creditNote.status.canceled") },
    ],
    [t]
  );

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

  const loadCreditNotes = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingCreditNotes(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (customerFilter !== "all") {
      params.set("customerId", customerFilter);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/credit-notes?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setCreditNotes(data.creditNotes ?? []))
      .catch(() => setCreditNotes([]))
      .finally(() => setLoadingCreditNotes(false));
  }, [activeCompanyId, customerFilter, query, statusFilter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    loadCreditNotes();
  }, [loadCreditNotes]);

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("creditNote.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("creditNote.subtitle")}</p>
        </div>
        <Link
          href="/sales/credit-notes/new"
          className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
        >
          {t("creditNote.create")}
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
              placeholder={t("creditNote.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("creditNote.statusFilter")}</span>
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
            <span className="mb-1 block text-xs text-muted">{t("creditNote.customerFilter")}</span>
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
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("creditNote.listTitle")}</span>
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
          <div className="p-4 text-sm text-muted">{t("creditNote.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("creditNote.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("creditNote.invoice")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("creditNote.customer")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("creditNote.issueDate")}</th>
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
                        href={`/sales/credit-notes/${note.id}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {note.creditNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{note.invoiceNumber}</td>
                    <td className="px-4 py-2">{note.customerName}</td>
                    <td className="px-4 py-2">{formatDate(note.issueDate)}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(note.total, note.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {t(`creditNote.status.${note.status ?? "draft"}`)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/sales/credit-notes/${note.id}`}
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
