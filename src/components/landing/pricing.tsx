"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export function Pricing() {
  const { t, locale } = useTranslations();
  const isRtl = locale === "ar";

  const plans = [
    {
      name: t("landing.pricing.starter.name"),
      price: t("landing.pricing.starter.price"),
      period: t("landing.pricing.period"),
      description: t("landing.pricing.starter.desc"),
      features: [
        t("landing.pricing.starter.feat1"),
        t("landing.pricing.starter.feat2"),
        t("landing.pricing.starter.feat3"),
        t("landing.pricing.starter.feat4"),
      ],
      cta: t("landing.pricing.cta"),
      popular: false,
    },
    {
      name: t("landing.pricing.pro.name"),
      price: t("landing.pricing.pro.price"),
      period: t("landing.pricing.period"),
      description: t("landing.pricing.pro.desc"),
      features: [
        t("landing.pricing.pro.feat1"),
        t("landing.pricing.pro.feat2"),
        t("landing.pricing.pro.feat3"),
        t("landing.pricing.pro.feat4"),
        t("landing.pricing.pro.feat5"),
      ],
      cta: t("landing.pricing.cta"),
      popular: true,
    },
    {
      name: t("landing.pricing.enterprise.name"),
      price: t("landing.pricing.enterprise.price"),
      period: t("landing.pricing.period"),
      description: t("landing.pricing.enterprise.desc"),
      features: [
        t("landing.pricing.enterprise.feat1"),
        t("landing.pricing.enterprise.feat2"),
        t("landing.pricing.enterprise.feat3"),
        t("landing.pricing.enterprise.feat4"),
        t("landing.pricing.enterprise.feat5"),
      ],
      cta: t("landing.pricing.enterprise.cta"),
      popular: false,
    },
  ];

  return (
    <section id="pricing" dir={isRtl ? "rtl" : "ltr"} className="py-24 bg-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-base font-semibold text-primary tracking-wide uppercase">{t("landing.pricing.badge")}</h2>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
            {t("landing.pricing.title")}
          </p>
          <p className="mt-4 text-xl text-slate-600">
            {t("landing.pricing.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-8 shadow-sm transition-all hover:shadow-md ${
                plan.popular
                  ? "border-primary ring-2 ring-primary/10 scale-105 z-10"
                  : "border-slate-200"
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-4 py-1 text-sm font-semibold text-white shadow-sm">
                  {t("landing.pricing.mostPopular")}
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
                <div className="mt-6 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                  <span className="ml-1 text-sm font-medium text-slate-500">/{plan.period}</span>
                </div>
              </div>

              <ul className="mb-8 space-y-4 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start">
                    <svg
                      className="h-5 w-5 flex-shrink-0 text-primary"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3 text-sm text-slate-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className={`block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold transition-colors ${
                  plan.popular
                    ? "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
                    : "bg-slate-50 text-slate-900 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
