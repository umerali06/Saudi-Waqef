"use client";

import { SessionProvider } from "next-auth/react";
import { LocaleProvider } from "@/i18n/provider";
import { UnsavedChangesProvider } from "@/components/unsaved-changes";
import type { Locale } from "@/i18n/messages";

export function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  return (
    <SessionProvider>
      <LocaleProvider initialLocale={initialLocale}>
        <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
      </LocaleProvider>
    </SessionProvider>
  );
}
