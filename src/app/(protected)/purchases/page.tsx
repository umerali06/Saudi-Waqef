"use client";

import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

export default function PurchasesPage() {
  const { activeCompany } = useCompany();
  const { t } = useTranslations();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("purchases.title")}</h1>
        <p className="text-sm text-muted">
          {t("labels.activeCompany", {
            company: activeCompany?.name ?? t("common.na"),
          })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/purchases/vendors"
          className="app-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <h2 className="text-lg font-semibold">{t("purchases.vendorsCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted">{t("purchases.vendorsCardDescription")}</p>
        </Link>
        <Link
          href="/purchases/bills"
          className="app-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <h2 className="text-lg font-semibold">{t("purchases.billsCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted">{t("purchases.billsCardDescription")}</p>
        </Link>
        <Link
          href="/purchases/vendor-credit-notes"
          className="app-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <h2 className="text-lg font-semibold">{t("purchases.creditNotesCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted">
            {t("purchases.creditNotesCardDescription")}
          </p>
        </Link>
        <Link
          href="/purchases/expenses"
          className="app-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <h2 className="text-lg font-semibold">{t("purchases.expensesCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted">
            {t("purchases.expensesCardDescription")}
          </p>
        </Link>
        <Link
          href="/purchases/expense-categories"
          className="app-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <h2 className="text-lg font-semibold">
            {t("purchases.expenseCategoriesCardTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {t("purchases.expenseCategoriesCardDescription")}
          </p>
        </Link>
      </div>
    </section>
  );
}
