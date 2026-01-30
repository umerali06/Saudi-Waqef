"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
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
  type: "cash" | "bank";
  status: "active" | "inactive";
};

export default function ReceiptDetailPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptId = params.receiptId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
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

  const loadReceipt = useCallback(async () => {
    setLoadingReceipt(true);
    const response = await fetch(`/api/payments/receipts/${receiptId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setLoadingReceipt(false);
      return;
    }
    const data = await response.json();
    setReceipt(data.receipt ?? null);
    setLoadingReceipt(false);
  }, [receiptId]);

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
    loadReceipt();
  }, [loadReceipt]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  if (errorKey) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {t(errorKey)}
      </div>
    );
  }

  if (loadingReceipt && !receipt) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <div className="app-card space-y-4 p-5">
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
        <div className="app-card space-y-3 p-5">
          <SkeletonBlock className="h-4 w-40" />
          {Array.from({ length: 3 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-8 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!receipt) {
    return <p className="text-sm text-muted">{t("common.loading")}</p>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("receipt.detailsTitle")}</h1>
          <p className="text-sm text-muted">{t("receipt.detailsSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/payments/receipts/${receipt.id}/print`}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
          >
            {t("receipt.print")}
          </Link>
          <Link
            href={`/payments/receipts/${receipt.id}/print?print=1`}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("receipt.quickPrint")}
          </Link>
        </div>
      </div>

      <div className="app-card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted">{t("receipt.number")}</p>
            <p className="font-semibold">{receipt.receiptNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("receipt.date")}</p>
            <p className="font-semibold">{formatDate(receipt.receiptDate)}</p>
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
            <p className="font-semibold">
              {loadingAccounts ? "—" : accountMap.get(receipt.accountId) ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("common.reference")}</p>
            <p className="font-semibold">{receipt.reference ?? "-"}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.total")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(receipt.totalAmount, receipt.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.applied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(receipt.appliedAmount, receipt.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.unapplied")}</p>
            <p className="mt-1 font-semibold">
              {formatCurrency(receipt.unappliedAmount, receipt.currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("receipt.allocations")}
        </div>
        {receipt.allocations.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("receipt.noAllocations")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.invoice")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("receipt.applyAmount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {receipt.allocations.map((allocation) => (
                  <tr key={allocation.invoiceId}>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/sales/invoices/${allocation.invoiceId}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {allocation.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(allocation.amount, receipt.currency)}
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
