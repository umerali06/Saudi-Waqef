"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
};

export default function VendorPaymentPrintPage() {
  const params = useParams<{ paymentId: string }>();
  const paymentId = params.paymentId;
  const searchParams = useSearchParams();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [payment, setPayment] = useState<VendorPaymentDetail | null>(null);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.accountId, account.name])),
    [accounts]
  );

  useEffect(() => {
    fetch(`/api/payments/vendor-payments/${paymentId}`)
      .then((res) => res.json())
      .then(async (paymentData) => {
        const nextPayment = paymentData.payment ?? null;
        setPayment(nextPayment);
        if (!nextPayment?.companyId) {
          return;
        }
        const accountResponse = await fetch(
          `/api/cash-bank-accounts?companyId=${nextPayment.companyId}`
        );
        if (!accountResponse.ok) {
          return;
        }
        const accountData = await accountResponse.json();
        setAccounts(accountData.accounts ?? []);
      })
      .catch(() => setPayment(null))
      .finally(() => setLoading(false));
  }, [paymentId]);

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || payment?.currency || "SAR",
    }).format(value);

  const formatMethod = (value: string) => {
    const key = `payment.method.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-4 w-64" />
          <SkeletonBlock className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!payment) {
    return <p className="text-sm text-muted page-subtitle">{t("common.loading")}</p>;
  }

  return (
    <div className="min-h-screen bg-white px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
          >
            {t("common.print")}
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted">{t("vendorPayment.detailsTitle")}</p>
          <h1 className="text-2xl font-semibold page-title">{payment.paymentNumber}</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted">{t("vendorPayment.date")}</p>
            <p className="font-semibold">{payment.paymentDate}</p>
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
            <p className="font-semibold">{accountMap.get(payment.accountId) ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("common.reference")}</p>
            <p className="font-semibold">{payment.reference ?? "-"}</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.total")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(payment.totalAmount, payment.currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.applied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(payment.appliedAmount, payment.currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.unapplied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(payment.unappliedAmount, payment.currency)}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-modern">
            <thead className="bg-surface-muted text-muted thead-modern">
              <tr>
                <th className={`px-3 py-2 ${alignClass}`}>{t("bill.number")}</th>
                <th className={`px-3 py-2 ${alignClass}`}>{t("common.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payment.allocations.map((allocation) => (
                <tr key={allocation.billId}>
                  <td className="px-3 py-2">{allocation.billNumber}</td>
                  <td className="px-3 py-2">
                    {formatCurrency(allocation.amount, payment.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
