"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type VendorListItem = {
  id: string;
  name: string;
  legalName?: string;
  vatNumber?: string;
  crNumber?: string;
  status: "active" | "inactive";
  currency?: string;
  balance?: number;
};

type PaymentTerm = {
  id: string;
  name: string;
  days: number;
  status: "active" | "inactive";
};

type ImportError = {
  row: number;
  code?: string;
  field?: string;
  message?: string;
};

type ImportSummary = {
  created: number;
  errors: ImportError[];
};

const formatTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export default function VendorsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [vatFilter, setVatFilter] = useState("all");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [bulkStatus, setBulkStatus] = useState<"active" | "inactive">("active");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [remittanceAddress, setRemittanceAddress] = useState("");
  const [paymentTermId, setPaymentTermId] = useState("");
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("status.active") },
      { value: "inactive", label: t("status.inactive") },
    ],
    [t]
  );

  const formatCurrency = (value: number, currencyCode?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currencyCode || "SAR",
    }).format(value);

  const fieldLabels = useMemo(
    () => ({
      name: t("vendors.name"),
      legalName: t("vendors.legalName"),
      vatNumber: t("vendors.vatNumber"),
      vatRegistered: t("vendors.vatRegistered"),
      crNumber: t("vendors.crNumber"),
      email: t("common.email"),
      phone: t("common.phone"),
      remittanceAddress: t("vendors.remittanceAddress"),
      paymentTermId: t("vendors.paymentTerms"),
      preferredPaymentMethod: t("vendors.preferredPaymentMethod"),
      currency: t("common.currency"),
      notes: t("common.notes"),
      tags: t("common.tags"),
      status: t("common.status"),
    }),
    [t]
  );

  const formatImportError = (error: ImportError) => {
    if (error.message) {
      switch (error.message) {
        case "Invalid status":
          return t("import.invalidStatus");
        case "Invalid VAT registered flag":
          return t("import.invalidVatFlag");
        case "Duplicate name":
          return t("import.duplicateName");
        case "Duplicate VAT number":
          return t("import.duplicateVatNumber");
        case "Invalid VAT number":
          return t("import.invalidVatNumber");
        case "Invalid row":
          return t("import.invalidRow");
        default:
          return error.message;
      }
    }

    switch (error.code) {
      case "invalid_status":
        return t("import.invalidStatus");
      case "invalid_vat_registered":
        return t("import.invalidVatFlag");
      case "duplicate_name":
        return t("import.duplicateName");
      case "duplicate_vat_number":
        return t("import.duplicateVatNumber");
      case "invalid_vat_number":
        return t("import.invalidVatNumber");
      case "missing_name":
        return t("import.missingName");
      case "invalid_name":
        return t("import.invalidName");
      case "invalid_email":
        return t("import.invalidEmail");
      default:
        return t("import.invalidRow");
    }
  };

  const formatImportField = (field?: string) => {
    if (!field) {
      return "";
    }
    return fieldLabels[field as keyof typeof fieldLabels] ?? field;
  };

  const loadVendors = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingVendors(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (vatFilter !== "all") {
      params.set("vatRegistered", vatFilter);
    }
    if (balanceFilter !== "all") {
      params.set("balance", balanceFilter);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/vendors?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const next: VendorListItem[] = data.vendors ?? [];
        setVendors(next);
        setSelectedIds((prev) =>
          prev.filter((id) => next.some((vendor) => vendor.id === id))
        );
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingVendors(false));
  }, [activeCompanyId, balanceFilter, query, statusFilter, vatFilter]);

  const loadTerms = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingTerms(true);
    fetch(`/api/payment-terms?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setTerms(data.terms ?? []))
      .catch(() => setTerms([]))
      .finally(() => setLoadingTerms(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name,
          legalName: legalName || null,
          vatRegistered,
          vatNumber: vatNumber || null,
          crNumber: crNumber || null,
          email: email || null,
          phone: phone || null,
          remittanceAddress: remittanceAddress || null,
          paymentTermId: paymentTermId || null,
          preferredPaymentMethod: preferredPaymentMethod || null,
          currency: currency || "SAR",
          notes: notes || null,
          tags: formatTags(tags),
          status,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Duplicate vendor") {
          setErrorKey("vendors.duplicate");
        } else if (data?.error === "Invalid payload") {
          setErrorKey("vendors.invalidPayload");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }

      setName("");
      setLegalName("");
      setVatRegistered(false);
      setVatNumber("");
      setCrNumber("");
      setEmail("");
      setPhone("");
      setRemittanceAddress("");
      setPaymentTermId("");
      setPreferredPaymentMethod("");
      setCurrency("SAR");
      setNotes("");
      setTags("");
      setStatus("active");
      loadVendors();
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === vendors.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(vendors.map((vendor) => vendor.id));
    }
  };

  const handleBulkStatus = () => {
    if (!activeCompanyId || selectedIds.length === 0) {
      return;
    }
    startTransition(async () => {
      await fetch("/api/vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          ids: selectedIds,
          status: bulkStatus,
        }),
      });
      setSelectedIds([]);
      loadVendors();
    });
  };

  const handleImport = () => {
    if (!activeCompanyId || !importFile) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setImportSummary(null);
      const csv = await importFile.text();
      const response = await fetch("/api/vendors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, csv }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setImportSummary({
        created: data.created ?? 0,
        errors: data.errors ?? [],
      });
      setImportFile(null);
      loadVendors();
    });
  };

  const handleExport = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(`/api/vendors/export?companyId=${activeCompanyId}`);
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "vendors.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleDownloadTemplate = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/vendors/import?companyId=${activeCompanyId}&lang=${locale}`
      );
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        locale === "ar" ? "vendors-template-ar.csv" : "vendors-template-en.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("vendors.title")}</h1>
          <p className="text-sm text-muted">{t("vendors.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("common.export")}
          </button>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("common.downloadTemplate")}
          </button>
          <label className="text-xs text-muted">
            <input
              type="file"
              accept="text/csv"
              className="block w-full text-xs"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={handleImport}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending || !importFile}
          >
            {t("common.import")}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">{t("vendors.importHint")}</p>

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("common.search")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("vendors.searchPlaceholder")}
            />
          </label>
          <label className="text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("vendors.statusFilter")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
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
          <label className="text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("vendors.vatFilter")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={vatFilter}
              onChange={(event) => setVatFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              <option value="true">{t("common.yes")}</option>
              <option value="false">{t("common.no")}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("vendors.balanceFilter")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={balanceFilter}
              onChange={(event) => setBalanceFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              <option value="due">{t("vendors.balanceDueFilter")}</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted">{t("vendors.bulkStatus")}</span>
          <select
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as "active" | "inactive")}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkStatus}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending || selectedIds.length === 0}
          >
            {t("common.apply")}
          </button>
        </div>
      </div>

      <form onSubmit={handleCreate} className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("vendors.addTitle")}</h2>
          <span className="text-xs text-muted">{t("common.optional")}</span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendors.name")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendors.legalName")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendors.crNumber")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={crNumber}
              onChange={(event) => setCrNumber(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendors.vatNumber")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={vatNumber}
              onChange={(event) => setVatNumber(event.target.value)}
              required={vatRegistered}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={vatRegistered}
              onChange={(event) => setVatRegistered(event.target.checked)}
            />
            {t("vendors.vatRegistered")}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.email")}</span>
            <input
              type="email"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.phone")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendors.paymentTerms")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={paymentTermId}
              onChange={(event) => setPaymentTermId(event.target.value)}
              disabled={loadingTerms}
            >
              <option value="">{t("common.none")}</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} ({term.days} {t("defaults.days")})
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("vendors.preferredPaymentMethod")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={preferredPaymentMethod}
              onChange={(event) => setPreferredPaymentMethod(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.currency")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={status}
              onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendors.remittanceAddress")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={remittanceAddress}
              onChange={(event) => setRemittanceAddress(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.tags")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("vendors.tagsHint")}
            />
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("common.add")}
        </button>
      </form>

      {importSummary ? (
        <div className="app-panel p-4 text-sm">
          <p>{t("vendors.importSummary", { count: String(importSummary.created) })}</p>
          {importSummary.errors.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold">{t("vendors.importErrors")}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {importSummary.errors.map((error) => (
                  <li key={`${error.row}-${error.code ?? error.message ?? "error"}`}>
                    #{error.row}{" "}
                    {formatImportField(error.field)
                      ? `- ${formatImportField(error.field)}: `
                      : "- "}
                    {formatImportError(error)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("vendors.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingVendors ? "—" : vendors.length}
          </span>
        </div>
        {loadingVendors ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : vendors.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("vendors.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    <input
                      type="checkbox"
                      checked={vendors.length > 0 && selectedIds.length === vendors.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendors.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendors.vatNumber")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.balance")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendors.map((vendor) => (
                  <tr key={vendor.id}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(vendor.id)}
                        onChange={() => toggleSelected(vendor.id)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-semibold">
                        <Link
                          href={`/purchases/vendors/${vendor.id}`}
                          className="text-primary underline decoration-dotted"
                        >
                          {vendor.name}
                        </Link>
                      </p>
                      {vendor.legalName ? (
                        <p className="text-xs text-muted">{vendor.legalName}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">{vendor.vatNumber ?? "-"}</td>
                    <td className="px-4 py-2">
                      {t(`status.${vendor.status ?? "active"}`)}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(vendor.balance ?? 0, vendor.currency)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/purchases/vendors/${vendor.id}`}
                        className="text-xs font-semibold text-foreground underline decoration-dotted"
                      >
                        {t("common.edit")}
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
