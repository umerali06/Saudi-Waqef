"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { SkeletonBlock } from "@/components/skeleton";
// import { toast } from "@/components/toast";
import { useToast } from "@/components/toast";

type BrandingForm = {
  logoUrl: string;
  header: string;
  footer: string;
  accentColor: string;
};

const EMPTY_BRANDING: BrandingForm = {
  logoUrl: "",
  header: "",
  footer: "",
  accentColor: "",
};

export default function DocumentBrandingPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [branding, setBranding] = useState<BrandingForm>(EMPTY_BRANDING);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadBranding = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setIsLoading(true);
    fetch(`/api/document-branding?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        setBranding({
          logoUrl: data?.branding?.logoUrl ?? "",
          header: data?.branding?.header ?? "",
          footer: data?.branding?.footer ?? "",
          accentColor: data?.branding?.accentColor ?? "",
        });
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

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
      setBranding((prev) => ({ ...prev, logoUrl: uploadedUrl }));
    } catch {
      setErrorKey("branding.uploadFailed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/document-branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          logoUrl: branding.logoUrl || null,
          header: branding.header || null,
          footer: branding.footer || null,
          accentColor: branding.accentColor || null,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
      } else {
        toast(t("common.saved"), "success");
      }
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("branding.title")}</h1>
        <p className="text-sm text-muted">{t("branding.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="app-card p-5">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <SkeletonBlock className="mb-2 h-4 w-24" />
              <div className="flex gap-3">
                <SkeletonBlock className="h-8 w-24" />
                <SkeletonBlock className="h-12 w-40" />
              </div>
            </div>
            <div className="md:col-span-2">
              <SkeletonBlock className="mb-2 h-4 w-24" />
              <SkeletonBlock className="h-24 w-full" />
            </div>
            <div className="md:col-span-2">
              <SkeletonBlock className="mb-2 h-4 w-24" />
              <SkeletonBlock className="h-24 w-full" />
            </div>
            <div>
              <SkeletonBlock className="mb-2 h-4 w-24" />
              <SkeletonBlock className="h-10 w-20" />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass} md:col-span-2`}>
              <span className="mb-1 block text-xs text-muted">
                {t("branding.logo")}
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
                {branding.logoUrl ? (
                  <>
                    <Image
                      src={branding.logoUrl}
                      alt={t("branding.logoAlt")}
                      className="h-10 w-auto rounded-md border border-border bg-surface p-1"
                      width={160}
                      height={40}
                      unoptimized
                    />
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted"
                      onClick={() =>
                        setBranding((prev) => ({ ...prev, logoUrl: "" }))
                      }
                    >
                      {t("branding.removeLogo")}
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-muted">{t("branding.noLogo")}</span>
                )}
              </div>
              {isUploading ? (
                <p className="mt-1 text-xs text-muted">{t("branding.uploading")}</p>
              ) : null}
            </label>
            <label className={`text-sm ${alignClass} md:col-span-2`}>
              <span className="mb-1 block text-xs text-muted">
                {t("branding.header")}
              </span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={branding.header}
                onChange={(event) =>
                  setBranding((prev) => ({ ...prev, header: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass} md:col-span-2`}>
              <span className="mb-1 block text-xs text-muted">
                {t("branding.footer")}
              </span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={branding.footer}
                onChange={(event) =>
                  setBranding((prev) => ({ ...prev, footer: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("branding.accentColor")}
              </span>
              <input
                type="color"
                className="h-10 w-20 rounded-lg border border-border bg-surface"
                value={branding.accentColor || "#0c5f5a"}
                onChange={(event) =>
                  setBranding((prev) => ({ ...prev, accentColor: event.target.value }))
                }
              />
            </label>
          </div>
        )}
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
          {t("common.save")}
        </button>
      </form>
    </section>
  );
}
