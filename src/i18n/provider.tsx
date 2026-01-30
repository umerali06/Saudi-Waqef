"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, messages, type Locale } from "@/i18n/messages";

type Translator = (key: string, params?: Record<string, string>) => string;

type I18nContextValue = {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);
const missingKeys = new Set<string>();

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function formatMessage(template: string, params?: Record<string, string>) {
  if (!params) {
    return template;
  }
  return Object.keys(params).reduce((result, key) => {
    return result.replace(new RegExp(`\\{${key}\\}`, "g"), params[key]);
  }, template);
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? DEFAULT_LOCALE
  );

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    document.cookie = `locale=${nextLocale}; path=/; max-age=${ONE_YEAR_SECONDS}`;
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === "ar" ? "rtl" : "ltr";
  }, []);

  useEffect(() => {
    if (!document.cookie.includes("locale=")) {
      document.cookie = `locale=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}`;
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const t = useCallback<Translator>(
    (key, params) => {
      const dictionary = messages[locale] ?? messages[DEFAULT_LOCALE];
      const value = dictionary[key];
      if (!value && process.env.NODE_ENV !== "production") {
        const cacheKey = `${locale}:${key}`;
        if (!missingKeys.has(cacheKey)) {
          missingKeys.add(cacheKey);
          console.warn(`[i18n] Missing translation for ${cacheKey}`);
        }
      }
      const resolved = value ?? key;
      return formatMessage(resolved, params);
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      t,
      setLocale,
    }),
    [locale, t, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslations() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslations must be used within LocaleProvider");
  }
  return context;
}
