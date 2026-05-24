"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type PaymentAllocation = {
  billId: string;
  billNumber: string;
  amount: number;
};

type VendorPaymentDetail = {
  id: string;
  companyId: string;
  paymentNumber: string;
  paymentDate: string;
  vendorId: string;
  vendorName: string;
  method: string;
  accountId: string;
  reference?: string | null;
  currency: string;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  allocations: PaymentAllocation[];
};

type CashBankAccount = {
  id: string;
  accountId: string;
  name: string;
  type: "cash" | "bank";
  status: "active" | "inactive";
};

export default function VendorPaymentDetailPage() {
  const params = useParams<{ paymentId: string }>();
  const paymentId = params.paymentId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [payment, setPayment] = useState<VendorPaymentDetail | null>(null);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.accountId, account.name])),
    [accounts]
  );

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || "SAR",
    }).format(value);

  const formatMethod = (value: string) => {
    const key = `payment.method.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  const formatDate = (value?: string) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const loadPayment = useCallback(async () => {
    setLoadingPayment(true);
    const response = await fetch(`/api/payments/vendor-payments/${paymentId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setLoadingPayment(false);
      return;
    }
    const data = await response.json();
    setPayment(data.payment ?? null);
    setLoadingPayment(false);
  }, [paymentId]);

  const loadAccounts = useCallback(async () => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingAccounts(true);
    const response = await fetch(`/api/cash-bank-accounts?companyId=${activeCompanyId}`);
    if (!response.ok) {
      setAccounts([]);
      setLoadingAccounts(false);
      return;
    }
    const data = await response.json();
    setAccounts(data.accounts ?? []);
    setLoadingAccounts(false);
  }, [activeCompanyId]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {t(errorKey)}
      </div>
    );
  }

  if (loadingPayment && !payment) {
    return (
      <section className="space-y-6 page-shell">
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <div className="app-card space-y-4 p-5 card-modern">
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-5 w-32" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-16 w-full" />
            ))}
          </div>
        </div>
        <div className="app-card space-y-3 p-5 card-modern">
          <SkeletonBlock className="h-4 w-40" />
          {Array.from({ length: 3 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-8 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!payment) {
    return <p className="text-sm text-muted page-subtitle">{t("common.loading")}</p>;
  }

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("vendorPayment.detailsTitle")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("vendorPayment.detailsSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/payments/vendor-payments/${payment.id}/print`}
            className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
          >
            {t("vendorPayment.print")}
          </Link>
          <Link
            href={`/payments/vendor-payments/${payment.id}/print?print=1`}
            className="rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("vendorPayment.quickPrint")}
          </Link>
        </div>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted">{t("vendorPayment.number")}</p>
            <p className="font-semibold">{payment.paymentNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("vendorPayment.date")}</p>
            <p className="font-semibold">{formatDate(payment.paymentDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("vendorPayment.vendor")}</p>
            <p className="font-semibold">{payment.vendorName}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("vendorPayment.method")}</p>
            <p className="font-semibold">{formatMethod(payment.method)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("vendorPayment.account")}</p>
            <p className="font-semibold">
              {loadingAccounts ? "—" : accountMap.get(payment.accountId) ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("common.reference")}</p>
            <p className="font-semibold">{payment.reference ?? "-"}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.total")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(payment.totalAmount, payment.currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.applied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(payment.appliedAmount, payment.currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.unapplied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(payment.unappliedAmount, payment.currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("vendorPayment.allocations")}
        </div>
        {payment.allocations.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("vendorPayment.noAllocations")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.bill")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("vendorPayment.applyAmount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payment.allocations.map((allocation) => (
                  <tr key={allocation.billId}>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/purchases/bills/${allocation.billId}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {allocation.billNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(allocation.amount, payment.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
