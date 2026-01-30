"use client";

import { useMemo } from "react";
import { useTranslations } from "@/i18n/provider";

type FormatNumberOptions = Intl.NumberFormatOptions;

type FormatterConfig = {
  currency?: string;
};

export function useLocaleFormatters(config?: FormatterConfig) {
  const { locale } = useTranslations();
  const localeTag = locale === "ar" ? "ar-SA" : "en-US";

  const currency = config?.currency ?? "SAR";

  const formatNumber = useMemo(
    () => (value: number, options?: FormatNumberOptions) => {
      if (!Number.isFinite(value)) {
        return "-";
      }
      return new Intl.NumberFormat(localeTag, options).format(value);
    },
    [localeTag]
  );

  const formatCurrency = useMemo(
    () =>
      (value: number, overrideCurrency?: string) => {
        if (!Number.isFinite(value)) {
          return "-";
        }
        return new Intl.NumberFormat(localeTag, {
          style: "currency",
          currency: overrideCurrency ?? currency,
          maximumFractionDigits: 2,
        }).format(value);
      },
    [currency, localeTag]
  );

  const formatPercent = useMemo(
    () => (value: number, digits = 1) => {
      if (!Number.isFinite(value)) {
        return "-";
      }
      return new Intl.NumberFormat(localeTag, {
        style: "percent",
        maximumFractionDigits: digits,
      }).format(value);
    },
    [localeTag]
  );

  const formatDate = useMemo(
    () => (value?: string | Date | null) => {
      if (!value) {
        return "-";
      }
      const date =
        value instanceof Date
          ? value
          : new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
      return new Intl.DateTimeFormat(localeTag).format(date);
    },
    [localeTag]
  );

  const formatDateTime = useMemo(
    () => (value?: string | Date | null) => {
      if (!value) {
        return "-";
      }
      const date = value instanceof Date ? value : new Date(value);
      return new Intl.DateTimeFormat(localeTag, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    },
    [localeTag]
  );

  return {
    localeTag,
    formatNumber,
    formatCurrency,
    formatPercent,
    formatDate,
    formatDateTime,
  };
}
