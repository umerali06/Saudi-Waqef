"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useToast } from "@/components/toast";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";

type CompanyProfile = {
  name: string;
  legalName: string;
  vatNumber: string;
  crNumber: string;
  address: string;
  currency: string;
  fiscalYearStart: string;
  timezone: string;
  defaultLanguage: "ar" | "en";
};

type CompanyConfig = {
  vatEnabled: boolean;
  vatRate: number;
  vatFilingFrequency: "monthly" | "quarterly";
  taxInclusive: boolean;
  invoicePrefix: string;
  invoiceNextNumber: number;
  billPrefix: string;
  billNextNumber: number;
  creditPrefix: string;
  creditNextNumber: number;
  receiptPrefix: string;
  receiptNextNumber: number;
  vendorPaymentPrefix: string;
  vendorPaymentNextNumber: number;
  transferPrefix: string;
  transferNextNumber: number;
  adjustmentPrefix: string;
  adjustmentNextNumber: number;
};

const EMPTY_PROFILE: CompanyProfile = {
  name: "",
  legalName: "",
  vatNumber: "",
  crNumber: "",
  address: "",
  currency: "SAR",
  fiscalYearStart: "01-01",
  timezone: "Asia/Riyadh",
  defaultLanguage: "ar",
};

const EMPTY_CONFIG: CompanyConfig = {
  vatEnabled: true,
  vatRate: 15,
  vatFilingFrequency: "quarterly",
  taxInclusive: false,
  invoicePrefix: "INV-",
  invoiceNextNumber: 1,
  billPrefix: "BILL-",
  billNextNumber: 1,
  creditPrefix: "CR-",
  creditNextNumber: 1,
  receiptPrefix: "RCPT-",
  receiptNextNumber: 1,
  vendorPaymentPrefix: "VPAY-",
  vendorPaymentNextNumber: 1,
  transferPrefix: "TRF-",
  transferNextNumber: 1,
  adjustmentPrefix: "ADJ-",
  adjustmentNextNumber: 1,
};

export default function CompanyProfilePage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { setDirty, markClean } = useUnsavedChanges();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [config, setConfig] = useState<CompanyConfig>(EMPTY_CONFIG);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const snapshot = useMemo(
    () => JSON.stringify({ profile, config, logoUrl }),
    [profile, config, logoUrl]
  );

  const loadCompany = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setIsLoading(true);
    markClean();
    Promise.all([
      fetch(`/api/companies/${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
      fetch(`/api/document-branding?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
    ])
      .then(([companyData, configData, brandingData]) => {
        const nextProfile: CompanyProfile = {
          name: companyData?.company?.name ?? "",
          legalName: companyData?.company?.legalName ?? "",
          vatNumber: companyData?.company?.vatNumber ?? "",
          crNumber: companyData?.company?.crNumber ?? "",
          address: companyData?.company?.address ?? "",
          currency: companyData?.company?.currency ?? "SAR",
          fiscalYearStart: companyData?.company?.fiscalYearStart ?? "01-01",
          timezone: companyData?.company?.timezone ?? "Asia/Riyadh",
          defaultLanguage: companyData?.company?.defaultLanguage ?? "ar",
        };
        const nextConfig: CompanyConfig = {
          vatEnabled: Boolean(configData?.config?.vatEnabled),
          vatRate: Number(configData?.config?.vatRate ?? 15),
          vatFilingFrequency: configData?.config?.vatFilingFrequency ?? "quarterly",
          taxInclusive: Boolean(configData?.config?.taxInclusive),
          invoicePrefix: configData?.config?.invoicePrefix ?? "INV-",
          invoiceNextNumber: Number(configData?.config?.invoiceNextNumber ?? 1),
          billPrefix: configData?.config?.billPrefix ?? "BILL-",
          billNextNumber: Number(configData?.config?.billNextNumber ?? 1),
          creditPrefix: configData?.config?.creditPrefix ?? "CR-",
          creditNextNumber: Number(configData?.config?.creditNextNumber ?? 1),
          receiptPrefix: configData?.config?.receiptPrefix ?? "RCPT-",
          receiptNextNumber: Number(configData?.config?.receiptNextNumber ?? 1),
          vendorPaymentPrefix: configData?.config?.vendorPaymentPrefix ?? "VPAY-",
          vendorPaymentNextNumber: Number(
            configData?.config?.vendorPaymentNextNumber ?? 1
          ),
          transferPrefix: configData?.config?.transferPrefix ?? "TRF-",
          transferNextNumber: Number(configData?.config?.transferNextNumber ?? 1),
          adjustmentPrefix: configData?.config?.adjustmentPrefix ?? "ADJ-",
          adjustmentNextNumber: Number(
            configData?.config?.adjustmentNextNumber ?? 1
          ),
        };
        const nextLogo = brandingData?.branding?.logoUrl ?? null;
        setProfile(nextProfile);
        setConfig(nextConfig);
        setLogoUrl(nextLogo);
        setInitialSnapshot(JSON.stringify({ profile: nextProfile, config: nextConfig, logoUrl: nextLogo }));
        markClean();
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId, markClean]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  useEffect(() => {
    if (!initialSnapshot) {
      return;
    }
    setDirty(snapshot !== initialSnapshot);
  }, [snapshot, initialSnapshot, setDirty]);

  const handleLogoUpload = async (file: File) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setIsUploading(true);
    try {
      const uploadedUrl = await uploadToCloudinary(
        file,
        `companies/${activeCompanyId}/branding`
      );
      setLogoUrl(uploadedUrl);
    } catch {
      setErrorKey("branding.uploadFailed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleProfileSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      setIsProfileSaving(true);
      const response = await fetch(`/api/companies/${activeCompanyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const brandingResponse = await fetch("/api/document-branding", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: activeCompanyId,
            logoUrl: logoUrl ?? null,
          }),
        });
        if (!brandingResponse.ok) {
          setErrorKey("error.saveFailed");
        }
        setInitialSnapshot(JSON.stringify({ profile, config, logoUrl }));
        markClean();
        toast(t("common.saved"), "success");
      }
      if (!response.ok) {
        setErrorKey(mapProfileError(data?.error));
      }
      setIsProfileSaving(false);
    });
  };

  const handleConfigSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      setIsConfigSaving(true);
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
      }
      if (response.ok) {
        setInitialSnapshot(JSON.stringify({ profile, config, logoUrl }));
        markClean();
        toast(t("common.saved"), "success");
      }
      setIsConfigSaving(false);
    });
  };

  const currencyLabel = useMemo(() => "SAR", []);

  const mapProfileError = (error?: string) => {
    switch (error) {
      case "Invalid VAT number":
        return "companyProfile.invalidVatNumber";
      case "Invalid name":
        return "companyProfile.invalidName";
      case "Invalid default language":
        return "companyProfile.invalidLanguage";
      default:
        return "error.saveFailed";
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("companyProfile.title")}</h1>
        <p className="text-sm text-muted">{t("companyProfile.subtitle")}</p>
      </div>

      <form onSubmit={handleProfileSubmit} className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("companyProfile.profile")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass} md:col-span-2`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.logo")}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {isLoading ? (
                <SkeletonBlock className="h-10 w-40" />
              ) : (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    className="block text-xs"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleLogoUpload(file);
                      }
                    }}
                  />
                  {logoUrl ? (
                    <>
                      <Image
                        src={logoUrl}
                        alt={t("companyProfile.logoAlt")}
                        className="h-10 w-auto rounded-md border border-border bg-surface p-1"
                        width={160}
                        height={40}
                        unoptimized
                      />
                      <button
                        type="button"
                        className="text-xs font-semibold text-muted"
                        onClick={() => setLogoUrl(null)}
                      >
                        {t("companyProfile.removeLogo")}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted">{t("companyProfile.noLogo")}</span>
                  )}
                </>
              )}
            </div>
            {isUploading ? (
              <p className="mt-1 text-xs text-muted">{t("branding.uploading")}</p>
            ) : null}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("common.companyName")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.name}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.legalName")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.legalName}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    legalName: event.target.value,
                  }))
                }
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.vatNumber")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.vatNumber}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    vatNumber: event.target.value,
                  }))
                }
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.crNumber")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.crNumber}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    crNumber: event.target.value,
                  }))
                }
              />
            )}
          </label>
          <label className={`text-sm ${alignClass} md:col-span-2`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.address")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.address}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    address: event.target.value,
                  }))
                }
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.currency")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={currencyLabel}
                disabled
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.fiscalYearStart")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.fiscalYearStart}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    fiscalYearStart: event.target.value,
                  }))
                }
                placeholder="01-01"
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.timezone")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.timezone}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    timezone: event.target.value,
                  }))
                }
              />
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("companyProfile.defaultLanguage")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-10 w-full" />
            ) : (
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={profile.defaultLanguage}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    defaultLanguage: event.target.value as "ar" | "en",
                  }))
                }
              >
                <option value="ar">{t("language.ar")}</option>
                <option value="en">{t("language.en")}</option>
              </select>
            )}
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
          disabled={isPending || isProfileSaving}
        >
          {t("common.save")}
        </button>
      </form>

      <form onSubmit={handleConfigSubmit} className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("config.title")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={config.vatEnabled}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  vatEnabled: event.target.checked,
                }))
              }
            />
            {t("config.vatEnabled")}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.vatRate")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.vatRate}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  vatRate: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.vatFiling")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.vatFilingFrequency}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  vatFilingFrequency: event.target.value as "monthly" | "quarterly",
                }))
              }
            >
              <option value="monthly">{t("config.vatMonthly")}</option>
              <option value="quarterly">{t("config.vatQuarterly")}</option>
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={config.taxInclusive}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  taxInclusive: event.target.checked,
                }))
              }
            />
            {t("config.taxInclusive")}
          </label>
        </div>

        <h3 className="mt-6 text-sm font-semibold">{t("config.numbering")}</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.invoicePrefix")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.invoicePrefix}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  invoicePrefix: event.target.value,
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.invoiceNext")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.invoiceNextNumber}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  invoiceNextNumber: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.billPrefix")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.billPrefix}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  billPrefix: event.target.value,
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.billNext")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.billNextNumber}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  billNextNumber: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.creditPrefix")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.creditPrefix}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  creditPrefix: event.target.value,
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.creditNext")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.creditNextNumber}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  creditNextNumber: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.receiptPrefix")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.receiptPrefix}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  receiptPrefix: event.target.value,
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.receiptNext")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.receiptNextNumber}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  receiptNextNumber: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.vendorPaymentPrefix")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.vendorPaymentPrefix}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  vendorPaymentPrefix: event.target.value,
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.vendorPaymentNext")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.vendorPaymentNextNumber}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  vendorPaymentNextNumber: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.transferPrefix")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.transferPrefix}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  transferPrefix: event.target.value,
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.transferNext")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.transferNextNumber}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  transferNextNumber: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.adjustmentPrefix")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.adjustmentPrefix}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  adjustmentPrefix: event.target.value,
                }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("config.adjustmentNext")}
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={config.adjustmentNextNumber}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  adjustmentNextNumber: Number(event.target.value),
                }))
              }
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
          disabled={isPending || isConfigSaving}
        >
          {t("config.save")}
        </button>
      </form>
    </section>
  );
}
