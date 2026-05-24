"use client";

import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

export default function SalesPage() {
  const { activeCompany } = useCompany();
  const { t } = useTranslations();
  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("sales.title")}</h1>
        <p className="text-sm text-muted page-subtitle">
          {t("labels.activeCompany", {
            company: activeCompany?.name ?? t("common.na"),
          })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/sales/customers"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("sales.customersCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">{t("sales.customersCardDescription")}</p>
        </Link>
        <Link
          href="/sales/invoices"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("sales.invoicesCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">{t("sales.invoicesCardDescription")}</p>
        </Link>
        <Link
          href="/sales/credit-notes"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("sales.creditNotesCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("sales.creditNotesCardDescription")}
          </p>
        </Link>
        <Link
          href="/sales/recurring"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("sales.recurringCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("sales.recurringCardDescription")}
          </p>
        </Link>
      </div>
    </section>
  );
}
