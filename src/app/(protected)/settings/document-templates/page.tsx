"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";

type TemplateStyle = "classic" | "modern" | "minimal";

type TemplateConfig = {
  invoiceTemplate: TemplateStyle;
  billTemplate: TemplateStyle;
  signatureEnabled: boolean;
  signatureName: string;
  signatureTitle: string;
  signatureImageUrl: string;
};

type Branding = {
  logoUrl: string | null;
  header: string | null;
  footer: string | null;
  accentColor: string | null;
};

type PreviewInvoice = {
  id: string;
  companyId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerVatNumber?: string;
  billingAddress?: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    totalAmount: number;
  }>;
  notes?: string | null;
  terms?: string | null;
};

type PreviewBill = {
  id: string;
  companyId: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  vendorName: string;
  vendorVatNumber?: string;
  remittanceAddress?: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    totalAmount: number;
  }>;
  notes?: string | null;
};

type ListEntry = {
  id: string;
  label: string;
};

type InvoiceListItem = {
  id?: string;
  invoiceNumber?: string;
  customerName?: string;
};

type BillListItem = {
  id?: string;
  billNumber?: string;
  vendorName?: string;
};

const EMPTY_CONFIG: TemplateConfig = {
  invoiceTemplate: "classic",
  billTemplate: "classic",
  signatureEnabled: false,
  signatureName: "",
  signatureTitle: "",
  signatureImageUrl: "",
};

const EMPTY_BRANDING: Branding = {
  logoUrl: null,
  header: null,
  footer: null,
  accentColor: null,
};

const templateClass = (template: TemplateStyle) => {
  switch (template) {
    case "modern":
      return "border-2 border-primary/20 bg-white shadow-sm";
    case "minimal":
      return "border border-dashed border-border bg-white";
    default:
      return "border border-border bg-surface";
  }
};

export default function DocumentTemplatesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { setDirty, markClean } = useUnsavedChanges();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [config, setConfig] = useState<TemplateConfig>(EMPTY_CONFIG);
  const [branding, setBranding] = useState<Branding>(EMPTY_BRANDING);
  const [invoiceOptions, setInvoiceOptions] = useState<ListEntry[]>([]);
  const [billOptions, setBillOptions] = useState<ListEntry[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [selectedBillId, setSelectedBillId] = useState<string>("");
  const [invoicePreview, setInvoicePreview] = useState<PreviewInvoice | null>(null);
  const [billPreview, setBillPreview] = useState<PreviewBill | null>(null);
  const [previewLocale, setPreviewLocale] = useState<"ar" | "en">(
    locale === "en" ? "en" : "ar"
  );
  const [isUploading, setIsUploading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const snapshot = useMemo(() => JSON.stringify(config), [config]);

  const loadReference = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    markClean();
    Promise.all([
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
      fetch(`/api/document-branding?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/invoices?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/bills?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([configData, brandingData, invoiceData, billData]) => {
        const cfg = configData?.config ?? {};
        const nextConfig: TemplateConfig = {
          invoiceTemplate: (cfg.invoiceTemplate ?? "classic") as TemplateStyle,
          billTemplate: (cfg.billTemplate ?? "classic") as TemplateStyle,
          signatureEnabled: Boolean(cfg.signatureEnabled),
          signatureName: cfg.signatureName ?? "",
          signatureTitle: cfg.signatureTitle ?? "",
          signatureImageUrl: cfg.signatureImageUrl ?? "",
        };
        const nextBranding: Branding = {
          logoUrl: brandingData?.branding?.logoUrl ?? null,
          header: brandingData?.branding?.header ?? null,
          footer: brandingData?.branding?.footer ?? null,
          accentColor: brandingData?.branding?.accentColor ?? null,
        };
        const invoiceList: InvoiceListItem[] = Array.isArray(invoiceData?.invoices)
          ? invoiceData.invoices
          : [];
        const billList: BillListItem[] = Array.isArray(billData?.bills)
          ? billData.bills
          : [];
        const invoices = invoiceList.flatMap((item) =>
          item?.id
            ? [
                {
                  id: item.id,
                  label: `${item.invoiceNumber ?? "-"} - ${item.customerName ?? ""}`.trim(),
                },
              ]
            : []
        );
        const bills = billList.flatMap((item) =>
          item?.id
            ? [
                {
                  id: item.id,
                  label: `${item.billNumber ?? "-"} - ${item.vendorName ?? ""}`.trim(),
                },
              ]
            : []
        );
        setInvoiceOptions(invoices);
        setBillOptions(bills);
        setSelectedInvoiceId(invoices[0]?.id ?? "");
        setSelectedBillId(bills[0]?.id ?? "");
        setConfig(nextConfig);
        setBranding(nextBranding);
        setInitialSnapshot(JSON.stringify(nextConfig));
        markClean();
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId, markClean]);

  useEffect(() => {
    loadReference();
  }, [loadReference]);

  useEffect(() => {
    if (!selectedInvoiceId) {
      setInvoicePreview(null);
      return;
    }
    fetch(`/api/invoices/${selectedInvoiceId}`)
      .then((res) => res.json())
      .then((data) => setInvoicePreview(data?.invoice ?? null))
      .catch(() => setInvoicePreview(null));
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!selectedBillId) {
      setBillPreview(null);
      return;
    }
    fetch(`/api/bills/${selectedBillId}`)
      .then((res) => res.json())
      .then((data) => setBillPreview(data?.bill ?? null))
      .catch(() => setBillPreview(null));
  }, [selectedBillId]);

  useEffect(() => {
    if (!initialSnapshot) {
      return;
    }
    setDirty(snapshot !== initialSnapshot);
  }, [snapshot, initialSnapshot, setDirty]);

  const handleSave = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceTemplate: config.invoiceTemplate,
          billTemplate: config.billTemplate,
          signatureEnabled: config.signatureEnabled,
          signatureName: config.signatureName || null,
          signatureTitle: config.signatureTitle || null,
          signatureImageUrl: config.signatureImageUrl || null,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setInitialSnapshot(JSON.stringify(config));
      markClean();
    });
  };

  const handleSignatureUpload = async (file: File) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setIsUploading(true);
    try {
      const uploadedUrl = await uploadToCloudinary(
        file,
        `companies/${activeCompanyId}/signatures`
      );
      setConfig((prev) => ({ ...prev, signatureImageUrl: uploadedUrl }));
    } catch {
      setErrorKey("templates.signatureUploadFailed");
    } finally {
      setIsUploading(false);
    }
  };

  const formatCurrency = (value: number, currency: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || "SAR",
    }).format(value);

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(
      date
    );
  };

  const openPreview = (type: "invoice" | "bill") => {
    const docId = type === "invoice" ? selectedInvoiceId : selectedBillId;
    if (!docId) {
      setErrorKey("templates.previewMissing");
      return;
    }
    document.cookie = `locale=${previewLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    const url =
      type === "invoice"
        ? `/sales/invoices/${docId}/print`
        : `/purchases/bills/${docId}/print`;
    window.open(url, "_blank", "noopener");
  };

  const accentColor = branding.accentColor || "#0c5f5a";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("templates.title")}</h1>
        <p className="text-sm text-muted">{t("templates.subtitle")}</p>
      </div>

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("templates.stylesTitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.invoiceTemplate")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.invoiceTemplate}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  invoiceTemplate: event.target.value as TemplateStyle,
                }))
              }
            >
              <option value="classic">{t("templates.style.classic")}</option>
              <option value="modern">{t("templates.style.modern")}</option>
              <option value="minimal">{t("templates.style.minimal")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.billTemplate")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.billTemplate}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  billTemplate: event.target.value as TemplateStyle,
                }))
              }
            >
              <option value="classic">{t("templates.style.classic")}</option>
              <option value="modern">{t("templates.style.modern")}</option>
              <option value="minimal">{t("templates.style.minimal")}</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">{t("templates.brandingHint")}</p>
      </div>

      <div className="app-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("templates.signatureTitle")}</h2>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={config.signatureEnabled}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  signatureEnabled: event.target.checked,
                }))
              }
            />
            {t("templates.signatureEnabled")}
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.signatureName")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.signatureName}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, signatureName: event.target.value }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.signatureRole")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={config.signatureTitle}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, signatureTitle: event.target.value }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass} md:col-span-2`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.signatureImage")}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/*"
                className="block text-xs"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleSignatureUpload(file);
                  }
                }}
              />
              {config.signatureImageUrl ? (
                <>
                  <Image
                    src={config.signatureImageUrl}
                    alt={t("templates.signaturePreview")}
                    className="h-10 w-auto rounded-md border border-border bg-white p-1"
                    width={120}
                    height={40}
                    unoptimized
                  />
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, signatureImageUrl: "" }))
                    }
                  >
                    {t("templates.signatureRemove")}
                  </button>
                </>
              ) : (
                <span className="text-xs text-muted">{t("templates.noSignature")}</span>
              )}
            </div>
            {isUploading ? (
              <p className="mt-1 text-xs text-muted">{t("branding.uploading")}</p>
            ) : null}
          </label>
        </div>
      </div>

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("templates.previewTitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.previewInvoice")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={selectedInvoiceId}
              onChange={(event) => setSelectedInvoiceId(event.target.value)}
            >
              <option value="">{t("templates.previewInvoiceEmpty")}</option>
              {invoiceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.previewBill")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={selectedBillId}
              onChange={(event) => setSelectedBillId(event.target.value)}
            >
              <option value="">{t("templates.previewBillEmpty")}</option>
              {billOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.previewLanguage")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={previewLocale}
              onChange={(event) =>
                setPreviewLocale(event.target.value as "ar" | "en")
              }
            >
              <option value="ar">{t("language.ar")}</option>
              <option value="en">{t("language.en")}</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold"
            onClick={() => openPreview("invoice")}
          >
            {t("templates.openInvoicePreview")}
          </button>
          <button
            type="button"
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold"
            onClick={() => openPreview("bill")}
          >
            {t("templates.openBillPreview")}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{t("templates.previewHint")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`rounded-2xl p-5 ${templateClass(config.invoiceTemplate)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              {branding.logoUrl ? (
                <Image
                  src={branding.logoUrl}
                  alt={t("branding.logoAlt")}
                  className="h-10 w-auto"
                  width={160}
                  height={40}
                  unoptimized
                />
              ) : null}
              <p className="mt-2 text-xs text-muted">{branding.header}</p>
              <h3 className="mt-2 text-lg font-semibold">{t("invoice.title")}</h3>
            </div>
            <div className={`text-sm ${alignClass}`}>
              <p>
                {t("invoice.number")}: <span className="font-semibold">{invoicePreview?.invoiceNumber ?? "-"}</span>
              </p>
              <p>{t("common.issueDate")}: {formatDate(invoicePreview?.invoiceDate)}</p>
              <p>{t("common.dueDate")}: {formatDate(invoicePreview?.dueDate)}</p>
            </div>
          </div>
          {invoicePreview ? (
            <>
              <div className="mt-4 rounded-xl border border-border bg-white p-3 text-sm">
                <p className="text-xs text-muted">{t("invoice.customer")}</p>
                <p className="font-semibold">{invoicePreview.customerName}</p>
                {invoicePreview.customerVatNumber ? (
                  <p className="text-xs text-muted">{invoicePreview.customerVatNumber}</p>
                ) : null}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-surface-muted text-muted">
                    <tr>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("invoice.item")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("invoice.quantity")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("invoice.unitPrice")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("invoice.taxCategory")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("invoice.lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoicePreview.lines.slice(0, 4).map((line) => (
                      <tr key={line.id}>
                        <td className="px-2 py-2">{line.description}</td>
                        <td className="px-2 py-2">{line.quantity}</td>
                        <td className="px-2 py-2">
                          {formatCurrency(line.unitPrice, invoicePreview.currency)}
                        </td>
                        <td className="px-2 py-2">
                          {line.taxRate ? `${(line.taxRate * 100).toFixed(1)}%` : "-"}
                        </td>
                        <td className="px-2 py-2">
                          {formatCurrency(line.totalAmount, invoicePreview.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span>{t("invoice.subtotal")}</span>
                  <span>{formatCurrency(invoicePreview.subtotal, invoicePreview.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("invoice.taxTotal")}</span>
                  <span>{formatCurrency(invoicePreview.taxTotal, invoicePreview.currency)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                  <span>{t("invoice.total")}</span>
                  <span>{formatCurrency(invoicePreview.total, invoicePreview.currency)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">{t("templates.noInvoicePreview")}</p>
          )}
          {config.signatureEnabled ? (
            <div className="mt-6 border-t border-border pt-4 text-sm">
              {config.signatureImageUrl ? (
                <Image
                  src={config.signatureImageUrl}
                  alt={t("templates.signaturePreview")}
                  className="h-12 w-auto"
                  width={160}
                  height={48}
                  unoptimized
                />
              ) : null}
              <p className="mt-2 font-semibold">{config.signatureName || "-"}</p>
              <p className="text-xs text-muted">{config.signatureTitle || ""}</p>
            </div>
          ) : null}
          {branding.footer ? (
            <p className="mt-4 text-xs text-muted">{branding.footer}</p>
          ) : null}
          <div className="mt-3 h-1 w-full rounded-full" style={{ backgroundColor: accentColor }} />
        </div>

        <div className={`rounded-2xl p-5 ${templateClass(config.billTemplate)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              {branding.logoUrl ? (
                <Image
                  src={branding.logoUrl}
                  alt={t("branding.logoAlt")}
                  className="h-10 w-auto"
                  width={160}
                  height={40}
                  unoptimized
                />
              ) : null}
              <p className="mt-2 text-xs text-muted">{branding.header}</p>
              <h3 className="mt-2 text-lg font-semibold">{t("bill.title")}</h3>
            </div>
            <div className={`text-sm ${alignClass}`}>
              <p>
                {t("bill.number")}: <span className="font-semibold">{billPreview?.billNumber ?? "-"}</span>
              </p>
              <p>{t("common.issueDate")}: {formatDate(billPreview?.billDate)}</p>
              <p>{t("common.dueDate")}: {formatDate(billPreview?.dueDate)}</p>
            </div>
          </div>
          {billPreview ? (
            <>
              <div className="mt-4 rounded-xl border border-border bg-white p-3 text-sm">
                <p className="text-xs text-muted">{t("bill.vendor")}</p>
                <p className="font-semibold">{billPreview.vendorName}</p>
                {billPreview.vendorVatNumber ? (
                  <p className="text-xs text-muted">{billPreview.vendorVatNumber}</p>
                ) : null}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-surface-muted text-muted">
                    <tr>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("bill.item")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("bill.quantity")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("bill.unitPrice")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("bill.taxCategory")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("bill.lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {billPreview.lines.slice(0, 4).map((line) => (
                      <tr key={line.id}>
                        <td className="px-2 py-2">{line.description}</td>
                        <td className="px-2 py-2">{line.quantity}</td>
                        <td className="px-2 py-2">
                          {formatCurrency(line.unitPrice, billPreview.currency)}
                        </td>
                        <td className="px-2 py-2">
                          {line.taxRate ? `${(line.taxRate * 100).toFixed(1)}%` : "-"}
                        </td>
                        <td className="px-2 py-2">
                          {formatCurrency(line.totalAmount, billPreview.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span>{t("bill.subtotal")}</span>
                  <span>{formatCurrency(billPreview.subtotal, billPreview.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("bill.taxTotal")}</span>
                  <span>{formatCurrency(billPreview.taxTotal, billPreview.currency)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                  <span>{t("bill.total")}</span>
                  <span>{formatCurrency(billPreview.total, billPreview.currency)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">{t("templates.noBillPreview")}</p>
          )}
          {config.signatureEnabled ? (
            <div className="mt-6 border-t border-border pt-4 text-sm">
              {config.signatureImageUrl ? (
                <Image
                  src={config.signatureImageUrl}
                  alt={t("templates.signaturePreview")}
                  className="h-12 w-auto"
                  width={160}
                  height={48}
                  unoptimized
                />
              ) : null}
              <p className="mt-2 font-semibold">{config.signatureName || "-"}</p>
              <p className="text-xs text-muted">{config.signatureTitle || ""}</p>
            </div>
          ) : null}
          {branding.footer ? (
            <p className="mt-4 text-xs text-muted">{branding.footer}</p>
          ) : null}
          <div className="mt-3 h-1 w-full rounded-full" style={{ backgroundColor: accentColor }} />
        </div>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      <button
        type="button"
        className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
        onClick={handleSave}
        disabled={isPending}
      >
        {t("common.save")}
      </button>
    </section>
  );
}
