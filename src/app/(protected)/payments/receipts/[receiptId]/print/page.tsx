"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type ReceiptAllocation = {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
};

type ReceiptDetail = {
  id: string;
  companyId: string;
  receiptNumber: string;
  receiptDate: string;
  customerId: string;
  customerName: string;
  method: string;
  accountId: string;
  reference?: string | null;
  currency: string;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  allocations: ReceiptAllocation[];
};

type CashBankAccount = {
  id: string;
  accountId: string;
  name: string;
};

export default function ReceiptPrintPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptId = params.receiptId;
  const searchParams = useSearchParams();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.accountId, account.name])),
    [accounts]
  );

  useEffect(() => {
    fetch(`/api/payments/receipts/${receiptId}`)
      .then((res) => res.json())
      .then(async (receiptData) => {
        const nextReceipt = receiptData.receipt ?? null;
        setReceipt(nextReceipt);
        if (!nextReceipt?.companyId) {
          return;
        }
        const accountResponse = await fetch(
          `/api/cash-bank-accounts?companyId=${nextReceipt.companyId}`
        );
        if (!accountResponse.ok) {
          return;
        }
        const accountData = await accountResponse.json();
        setAccounts(accountData.accounts ?? []);
      })
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [receiptId]);

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || receipt?.currency || "SAR",
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

  if (!receipt) {
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
          <p className="text-xs text-muted">{t("receipt.detailsTitle")}</p>
          <h1 className="text-2xl font-semibold page-title">{receipt.receiptNumber}</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted">{t("receipt.date")}</p>
            <p className="font-semibold">{receipt.receiptDate}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("receipt.customer")}</p>
            <p className="font-semibold">{receipt.customerName}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("receipt.method")}</p>
            <p className="font-semibold">{formatMethod(receipt.method)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("receipt.account")}</p>
            <p className="font-semibold">{accountMap.get(receipt.accountId) ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("common.reference")}</p>
            <p className="font-semibold">{receipt.reference ?? "-"}</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.total")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(receipt.totalAmount, receipt.currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.applied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(receipt.appliedAmount, receipt.currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.unapplied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(receipt.unappliedAmount, receipt.currency)}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-modern">
            <thead className="bg-surface-muted text-muted thead-modern">
              <tr>
                <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.number")}</th>
                <th className={`px-3 py-2 ${alignClass}`}>{t("common.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {receipt.allocations.map((allocation) => (
                <tr key={allocation.invoiceId}>
                  <td className="px-3 py-2">{allocation.invoiceNumber}</td>
                  <td className="px-3 py-2">
                    {formatCurrency(allocation.amount, receipt.currency)}
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
