"use client";

import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

export default function PaymentsPage() {
  const { activeCompany } = useCompany();
  const { t } = useTranslations();

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("payments.title")}</h1>
        <p className="text-sm text-muted page-subtitle">
          {t("labels.activeCompany", {
            company: activeCompany?.name ?? t("common.na"),
          })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/payments/accounts"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("payments.accountsCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("payments.accountsCardDescription")}
          </p>
        </Link>
        <Link
          href="/payments/methods"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("payments.methodsCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("payments.methodsCardDescription")}
          </p>
        </Link>
        <Link
          href="/payments/receipts"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("payments.receiptsCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("payments.receiptsCardDescription")}
          </p>
        </Link>
        <Link
          href="/payments/vendor-payments"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("payments.vendorPaymentsCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("payments.vendorPaymentsCardDescription")}
          </p>
        </Link>
        <Link
          href="/payments/transfers"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("payments.transfersCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("payments.transfersCardDescription")}
          </p>
        </Link>
        <Link
          href="/payments/adjustments"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("payments.adjustmentsCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("payments.adjustmentsCardDescription")}
          </p>
        </Link>
        <Link
          href="/payments/reconciliation"
          className="app-card p-6 transition hover:-translate-y-0.5 hover:shadow-lg card-modern"
        >
          <h2 className="text-lg font-semibold">{t("payments.reconciliationCardTitle")}</h2>
          <p className="mt-2 text-sm text-muted page-subtitle">
            {t("payments.reconciliationCardDescription")}
          </p>
        </Link>
      </div>
    </section>
  );
}
