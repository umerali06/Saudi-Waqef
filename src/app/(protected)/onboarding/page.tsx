"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { trackEvent } from "@/lib/telemetry/client";

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
};

export default function OnboardingPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [config, setConfig] = useState<CompanyConfig>(EMPTY_CONFIG);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    trackEvent({ name: "onboarding.started", companyId: activeCompanyId });
    Promise.all([
      fetch(`/api/companies/${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
      fetch(`/api/document-branding?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
    ])
      .then(([companyData, configData, brandingData]) => {
        if (companyData?.company) {
          setProfile({
            name: companyData.company.name ?? "",
            legalName: companyData.company.legalName ?? "",
            vatNumber: companyData.company.vatNumber ?? "",
            crNumber: companyData.company.crNumber ?? "",
            address: companyData.company.address ?? "",
            currency: companyData.company.currency ?? "SAR",
            fiscalYearStart: companyData.company.fiscalYearStart ?? "01-01",
            timezone: companyData.company.timezone ?? "Asia/Riyadh",
            defaultLanguage: companyData.company.defaultLanguage ?? "ar",
          });
        }
        if (configData?.config) {
          setConfig({
            vatEnabled: Boolean(configData.config.vatEnabled),
            vatRate: Number(configData.config.vatRate ?? 15),
            vatFilingFrequency:
              configData.config.vatFilingFrequency ?? "quarterly",
            taxInclusive: Boolean(configData.config.taxInclusive),
            invoicePrefix: configData.config.invoicePrefix ?? "INV-",
            invoiceNextNumber: Number(configData.config.invoiceNextNumber ?? 1),
            billPrefix: configData.config.billPrefix ?? "BILL-",
            billNextNumber: Number(configData.config.billNextNumber ?? 1),
            creditPrefix: configData.config.creditPrefix ?? "CR-",
            creditNextNumber: Number(configData.config.creditNextNumber ?? 1),
          });
        }
        if (brandingData?.branding) {
          setLogoUrl(brandingData.branding.logoUrl ?? null);
        }
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

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

  const saveStep = async () => {
    if (!activeCompanyId) {
      return false;
    }
    if (step === 1 || step === 2) {
      const response = await fetch(`/api/companies/${activeCompanyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapProfileError(data?.error));
        return false;
      }
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
        return false;
      }
    }
    if (step === 3 || step === 4) {
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    setErrorKey(null);
    startTransition(async () => {
      const ok = await saveStep();
      if (!ok) {
        return;
      }
      setStep((prev) => Math.min(prev + 1, 5));
    });
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      trackEvent({ name: "onboarding.completed", companyId: activeCompanyId });
      router.replace("/settings");
    });
  };

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
        <h1 className="text-2xl font-semibold">{t("onboarding.title")}</h1>
        <p className="text-sm text-muted">{t("onboarding.subtitle")}</p>
      </div>

      <div className="app-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {t(`onboarding.step${step}.title`)}
          </h2>
          <span className="text-xs text-muted">
            {t("onboarding.stepIndicator", { current: String(step), total: String(5) })}
          </span>
        </div>

        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass} md:col-span-2`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.logo")}
              </span>
              <div className="flex flex-wrap items-center gap-3">
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
              </div>
              {isUploading ? (
                <p className="mt-1 text-xs text-muted">{t("branding.uploading")}</p>
              ) : null}
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("common.companyName")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.name}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.legalName")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.legalName}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, legalName: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.vatNumber")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.vatNumber}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, vatNumber: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.crNumber")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.crNumber}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, crNumber: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass} md:col-span-2`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.address")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.address}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, address: event.target.value }))
                }
              />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.currency")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.currency}
                disabled
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.fiscalYearStart")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.fiscalYearStart}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    fiscalYearStart: event.target.value,
                  }))
                }
                placeholder="01-01"
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.timezone")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={profile.timezone}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, timezone: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("companyProfile.defaultLanguage")}
              </span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 md:grid-cols-2">
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
              <span className="mb-1 block text-xs text-muted">{t("config.vatRate")}</span>
              <input
                type="number"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
        ) : null}

        {step === 4 ? (
          <div className="grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("config.invoicePrefix")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={config.billPrefix}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, billPrefix: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("config.billNext")}
              </span>
              <input
                type="number"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={config.creditNextNumber}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    creditNextNumber: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4 text-sm">
            <div className="app-outline p-4">
              <p className="text-xs text-muted">{t("onboarding.reviewProfile")}</p>
              <p className="mt-2 font-semibold">{profile.name}</p>
              <p className="text-xs text-muted">{profile.legalName || t("common.na")}</p>
            </div>
            <div className="app-outline p-4">
              <p className="text-xs text-muted">{t("onboarding.reviewConfig")}</p>
              <p className="mt-2">
                {t("config.vatRate")}: {config.vatRate}%
              </p>
              <p>
                {t("config.vatFiling")}:{" "}
                {config.vatFilingFrequency === "monthly"
                  ? t("config.vatMonthly")
                  : t("config.vatQuarterly")}
              </p>
            </div>
          </div>
        ) : null}

        {errorKey ? <p className="mt-3 text-xs text-red-500">{t(errorKey)}</p> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {step > 1 ? (
            <button
              type="button"
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
              onClick={handleBack}
              disabled={isPending}
            >
              {t("onboarding.back")}
            </button>
          ) : null}
          {step < 5 ? (
            <button
              type="button"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              onClick={handleNext}
              disabled={isPending}
            >
              {t("onboarding.next")}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              onClick={handleFinish}
              disabled={isPending}
            >
              {t("onboarding.finish")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
