"use client";

import Link from "next/link";
import { ProductPreview } from "@/components/landing/product-preview";
import { useTranslations } from "@/i18n/provider";

export function Hero() {
  const { t, locale } = useTranslations();
  const isRtl = locale === "ar";

  return (
    <section dir={isRtl ? "rtl" : "ltr"} className="landing-hero relative overflow-hidden pt-28 pb-16 lg:pt-36 lg:pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <p className="mb-5 text-sm font-semibold text-primary">{t("landing.hero.badge")}</p>

          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-[1.2] text-foreground sm:text-5xl lg:text-6xl">
            {t("landing.hero.title1")} <br className="hidden sm:block" />
            <span className="text-primary">
              {t("landing.hero.title2")}
            </span>
          </h1>
          
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 sm:text-xl leading-relaxed">
            {t("landing.hero.description")}
          </p>
          
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row w-full sm:w-auto">
            <Link
              href="/register"
              className="btn-primary w-full justify-center px-7 py-3.5 text-base sm:w-auto"
            >
              {t("landing.hero.cta.trial")}
            </Link>
            <Link
              href="/login"
              className="btn-secondary w-full justify-center px-7 py-3.5 text-base sm:w-auto"
            >
              {t("landing.hero.cta.demo")}
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{t("landing.hero.trust.noCard")}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{t("landing.hero.trust.cancel")}</span>
            </div>
          </div>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}
