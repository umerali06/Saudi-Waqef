"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { SkeletonBlock } from "@/components/skeleton";
import { useToast } from "@/components/toast";

type TemplateStyle = "classic" | "modern" | "minimal";

type TemplateConfig = {
  invoiceTemplate: TemplateStyle;
  billTemplate: TemplateStyle;
  signatureEnabled: boolean;
  signatureName: string;
  signatureTitle: string;
  signatureImageUrl: string;
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

const TEMPLATE_STYLES: TemplateStyle[] = ["classic", "modern", "minimal"];

export default function DocumentTemplatesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const { setDirty, markClean } = useUnsavedChanges();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [config, setConfig] = useState<TemplateConfig>(EMPTY_CONFIG);
  const [invoiceOptions, setInvoiceOptions] = useState<ListEntry[]>([]);
  const [billOptions, setBillOptions] = useState<ListEntry[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [selectedBillId, setSelectedBillId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const snapshot = useMemo(() => JSON.stringify(config), [config]);

  const loadReference = useCallback(() => {
    if (!activeCompanyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    markClean();
    Promise.all([
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
      fetch(`/api/invoices?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/bills?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([configData, invoiceData, billData]) => {
        const cfg = configData?.config ?? {};
        const nextConfig: TemplateConfig = {
          invoiceTemplate: (cfg.invoiceTemplate ?? "classic") as TemplateStyle,
          billTemplate: (cfg.billTemplate ?? "classic") as TemplateStyle,
          signatureEnabled: Boolean(cfg.signatureEnabled),
          signatureName: cfg.signatureName ?? "",
          signatureTitle: cfg.signatureTitle ?? "",
          signatureImageUrl: cfg.signatureImageUrl ?? "",
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
        setInitialSnapshot(JSON.stringify(nextConfig));
        markClean();
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId, markClean]);

  useEffect(() => {
    loadReference();
  }, [loadReference]);

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
      toast(t("common.saved"), "success");
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

  const openPreview = (type: "invoice" | "bill") => {
    const docId = type === "invoice" ? selectedInvoiceId : selectedBillId;
    if (!docId) {
      setErrorKey("templates.previewMissing");
      return;
    }
    const url = type === "invoice" ? `/api/invoices/${docId}/pdf` : `/api/bills/${docId}/pdf`;
    window.open(url, "_blank", "noopener");
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("templates.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("templates.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("templates.stylesTitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.invoiceTemplate")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
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
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.billTemplate")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
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
            )}
          </label>
        </div>
        <dl className="mt-4 grid gap-3 text-xs md:grid-cols-3">
          {TEMPLATE_STYLES.map((style) => (
            <div key={style} className="rounded-lg border border-border p-3">
              <dt className="font-semibold">{t(`templates.style.${style}`)}</dt>
              <dd className="mt-1 text-muted">{t(`templates.describe.${style}`)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">{t("templates.brandingHint")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("templates.signatureTitle")}</h2>
          <label className="flex items-center gap-2 text-xs text-muted">
            {isLoading ? (
              <SkeletonBlock className="h-4 w-4" />
            ) : (
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
            )}
            {t("templates.signatureEnabled")}
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.signatureName")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={config.signatureName}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, signatureName: event.target.value }))
                }
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.signatureRole")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={config.signatureTitle}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, signatureTitle: event.target.value }))
                }
              />
            )}
          </label>
          <label className={`text-sm ${alignClass} md:col-span-2`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.signatureImage")}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {isLoading ? (
                <SkeletonBlock className="h-8 w-48" />
              ) : (
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
              )}
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

      <div className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("templates.previewTitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.previewInvoice")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
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
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("templates.previewBill")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
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
            )}
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => openPreview("invoice")}
          >
            {t("templates.openInvoicePreview")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => openPreview("bill")}
          >
            {t("templates.openBillPreview")}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{t("templates.previewHint")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      <button
        type="button"
        className="w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
        onClick={handleSave}
        disabled={isPending}
      >
        {t("common.save")}
      </button>
    </section>
  );
}
