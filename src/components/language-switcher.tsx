"use client";

import { useTranslations } from "@/i18n/provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslations();

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as "ar" | "en")}
        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
      >
        <option value="ar">{t("language.ar")}</option>
        <option value="en">{t("language.en")}</option>
      </select>
    </label>
  );
}
