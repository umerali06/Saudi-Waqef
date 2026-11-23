"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export function PageError({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  const { t } = useTranslations();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
      <h1 className="text-xl font-semibold">{t("pageError.title")}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{t("pageError.body")}</p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted">
          {t("pageError.reference")} <span dir="ltr">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-5 flex gap-3">
        <button type="button" className="btn-primary" onClick={reset}>
          {t("pageError.retry")}
        </button>
        <Link href={home} className="btn-secondary">
          {t("pageError.home")}
        </Link>
      </div>
    </div>
  );
}
