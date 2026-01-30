"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type BillLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  taxRate: number;
  totalAmount: number;
};

type PurchaseBill = {
  id: string;
  companyId: string;
  vendorName: string;
  vendorVatNumber?: string;
  remittanceAddress?: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  currency: string;
  notes?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  lines: BillLine[];
};

type TemplateConfig = {
  billTemplate: "classic" | "modern" | "minimal";
  signatureEnabled: boolean;
  signatureName: string;
  signatureTitle: string;
  signatureImageUrl: string;
  dateFormat: "yyyy-MM-dd" | "dd/MM/yyyy" | "MM/dd/yyyy";
  roundingPrecision: number;
  roundingMode: "standard" | "up" | "down";
};

type Branding = {
  logoUrl: string | null;
  header: string | null;
  footer: string | null;
  accentColor: string | null;
};

const EMPTY_CONFIG: TemplateConfig = {
  billTemplate: "classic",
  signatureEnabled: false,
  signatureName: "",
  signatureTitle: "",
  signatureImageUrl: "",
  dateFormat: "yyyy-MM-dd",
  roundingPrecision: 2,
  roundingMode: "standard",
};

const EMPTY_BRANDING: Branding = {
  logoUrl: null,
  header: null,
  footer: null,
  accentColor: null,
};

const templateClass = (template: TemplateConfig["billTemplate"]) => {
  switch (template) {
    case "modern":
      return "border-2 border-primary/20 bg-white shadow-sm";
    case "minimal":
      return "border border-dashed border-border bg-white";
    default:
      return "border border-border bg-surface";
  }
};

export default function BillPrintPage() {
  const params = useParams<{ billId: string }>();
  const billId = params.billId;
  const { activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const [bill, setBill] = useState<PurchaseBill | null>(null);
  const [config, setConfig] = useState<TemplateConfig>(EMPTY_CONFIG);
  const [branding, setBranding] = useState<Branding>(EMPTY_BRANDING);
  const alignClass = locale === "ar" ? "text-right" : "text-left";

  useEffect(() => {
    if (!billId) {
      return;
    }
    fetch(`/api/bills/${billId}`)
      .then((res) => res.json())
      .then((data) => setBill(data.bill ?? null))
      .catch(() => setBill(null));
  }, [billId]);

  useEffect(() => {
    if (!bill?.companyId) {
      return;
    }
    Promise.all([
      fetch(`/api/companies/${bill.companyId}/config`).then((res) => res.json()),
      fetch(`/api/document-branding?companyId=${bill.companyId}`).then((res) =>
        res.json()
      ),
    ])
      .then(([configData, brandingData]) => {
        const cfg = configData?.config ?? {};
        setConfig({
          billTemplate: (cfg.billTemplate ?? "classic") as TemplateConfig["billTemplate"],
          signatureEnabled: Boolean(cfg.signatureEnabled),
          signatureName: cfg.signatureName ?? "",
          signatureTitle: cfg.signatureTitle ?? "",
          signatureImageUrl: cfg.signatureImageUrl ?? "",
          dateFormat: (cfg.dateFormat ?? "yyyy-MM-dd") as TemplateConfig["dateFormat"],
          roundingPrecision:
            typeof cfg.roundingPrecision === "number" ? cfg.roundingPrecision : 2,
          roundingMode: (cfg.roundingMode ?? "standard") as TemplateConfig["roundingMode"],
        });
        setBranding({
          logoUrl: brandingData?.branding?.logoUrl ?? null,
          header: brandingData?.branding?.header ?? null,
          footer: brandingData?.branding?.footer ?? null,
          accentColor: brandingData?.branding?.accentColor ?? null,
        });
      })
      .catch(() => null);
  }, [bill?.companyId]);

  const roundingFactor = useMemo(
    () => Math.pow(10, config.roundingPrecision ?? 2),
    [config.roundingPrecision]
  );

  const roundValue = (value: number) => {
    if (config.roundingMode === "up") {
      return Math.ceil(value * roundingFactor) / roundingFactor;
    }
    if (config.roundingMode === "down") {
      return Math.floor(value * roundingFactor) / roundingFactor;
    }
    return Math.round(value * roundingFactor) / roundingFactor;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: bill?.currency || "SAR",
    }).format(roundValue(value));

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "-";
    }
    const [year, month, day] = value.split("-");
    switch (config.dateFormat) {
      case "dd/MM/yyyy":
        return `${day}/${month}/${year}`;
      case "MM/dd/yyyy":
        return `${month}/${day}/${year}`;
      default:
        return `${year}-${month}-${day}`;
    }
  };

  if (!bill) {
    return (
      <div className="min-h-screen bg-white p-8 text-sm text-muted">
        {t("common.loading")}
      </div>
    );
  }

  const accentColor = branding.accentColor || "#0c5f5a";

  return (
    <div className="min-h-screen bg-white p-8 text-foreground print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">{t("bill.detailsTitle")}</h1>
          <p className="text-sm text-muted">{bill.billNumber}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
        >
          {t("bill.print")}
        </button>
      </div>

      <div className={`mt-6 rounded-2xl p-6 print:mt-0 print:border-none print:bg-transparent print:p-0 ${templateClass(config.billTemplate)}`}>
        <div className="flex flex-wrap items-start justify-between gap-6">
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
            <h2 className="mt-2 text-2xl font-semibold">
              {activeCompany?.name ?? "-"}
            </h2>
            {branding.header ? (
              <p className="text-sm text-muted">{branding.header}</p>
            ) : null}
            <p className="text-sm text-muted">{t("bill.title")}</p>
          </div>
          <div className={`space-y-1 text-sm ${alignClass}`}>
            <p>
              {t("bill.number")}: <span className="font-semibold">{bill.billNumber}</span>
            </p>
            <p>{t("common.issueDate")}: {formatDate(bill.billDate)}</p>
            <p>{t("common.dueDate")}: {formatDate(bill.dueDate)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 rounded-xl border border-border bg-white p-4 text-sm">
          <div>
            <p className="text-xs text-muted">{t("bill.vendor")}</p>
            <p className="font-semibold">{bill.vendorName}</p>
            {bill.vendorVatNumber ? (
              <p className="text-xs text-muted">{bill.vendorVatNumber}</p>
            ) : null}
          </div>
          {bill.remittanceAddress ? (
            <div className="text-xs text-muted">{bill.remittanceAddress}</div>
          ) : null}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-muted text-muted">
              <tr>
                <th className={`px-3 py-2 ${alignClass}`}>{t("bill.item")}</th>
                <th className={`px-3 py-2 ${alignClass}`}>{t("bill.quantity")}</th>
                <th className={`px-3 py-2 ${alignClass}`}>{t("bill.unitPrice")}</th>
                <th className={`px-3 py-2 ${alignClass}`}>{t("bill.discount")}</th>
                <th className={`px-3 py-2 ${alignClass}`}>{t("bill.taxCategory")}</th>
                <th className={`px-3 py-2 ${alignClass}`}>{t("bill.lineTotal")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bill.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{line.description}</p>
                  </td>
                  <td className="px-3 py-2">
                    {line.quantity} {line.unit}
                  </td>
                  <td className="px-3 py-2">{formatCurrency(line.unitPrice)}</td>
                  <td className="px-3 py-2">{line.discountRate}%</td>
                  <td className="px-3 py-2">
                    {line.taxRate ? `${(line.taxRate * 100).toFixed(1)}%` : "-"}
                  </td>
                  <td className="px-3 py-2">{formatCurrency(line.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span>{t("bill.subtotal")}</span>
            <span>{formatCurrency(bill.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("bill.discountTotal")}</span>
            <span>{formatCurrency(bill.discountTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("bill.taxTotal")}</span>
            <span>{formatCurrency(bill.taxTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
            <span>{t("bill.total")}</span>
            <span>{formatCurrency(bill.total)}</span>
          </div>
        </div>

        {bill.notes ? (
          <div className="mt-6 text-xs text-muted">
            <p className="font-semibold text-foreground">{t("common.notes")}</p>
            <p className="mt-2">{bill.notes}</p>
          </div>
        ) : null}

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
          <div className="mt-6 text-xs text-muted">{branding.footer}</div>
        ) : null}

        <div className="mt-4 h-1 w-full rounded-full" style={{ backgroundColor: accentColor }} />
      </div>
    </div>
  );
}
