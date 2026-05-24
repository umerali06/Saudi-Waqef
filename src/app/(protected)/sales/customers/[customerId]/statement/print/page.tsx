"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type StatementInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  total: number;
  paid: number;
  credited: number;
  balance: number;
  currency: string;
};

type StatementPayload = {
  customer: { id: string; name: string; email?: string | null; currency?: string };
  totals: {
    invoiced: number;
    paid: number;
    credited: number;
    balance: number;
  };
  invoices: StatementInvoice[];
};

export default function CustomerStatementPrintPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const searchParams = useSearchParams();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [data, setData] = useState<StatementPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/statement`)
      .then((res) => res.json())
      .then((payload) => setData(payload ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || data?.customer.currency || "SAR",
    }).format(value);

  const formatDate = (value: string) => {
    if (!value) {
      return "-";
    }
    const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
  };

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
        {loading ? (
          <div className="space-y-4">
            <SkeletonBlock className="h-6 w-40" />
            <SkeletonBlock className="h-4 w-64" />
            <SkeletonBlock className="h-32 w-full" />
          </div>
        ) : data ? (
          <>
            <div className="space-y-2">
              <p className="text-xs text-muted">{t("customers.statementTitle")}</p>
              <h1 className="text-2xl font-semibold page-title">{data.customer.name}</h1>
              {data.customer.email ? (
                <p className="text-xs text-muted">{data.customer.email}</p>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                <p className="text-muted">{t("customers.statementInvoiced")}</p>
                <p className="font-semibold">{formatCurrency(data.totals.invoiced)}</p>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                <p className="text-muted">{t("customers.statementPaid")}</p>
                <p className="font-semibold">{formatCurrency(data.totals.paid)}</p>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                <p className="text-muted">{t("customers.statementCredited")}</p>
                <p className="font-semibold">{formatCurrency(data.totals.credited)}</p>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                <p className="text-muted">{t("customers.statementBalance")}</p>
                <p className="font-semibold">{formatCurrency(data.totals.balance)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.number")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.amount")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.balance")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.invoices.map((inv) => (
                    <tr key={inv.invoiceId}>
                      <td className="px-3 py-2">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-3 py-2">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-2">{formatCurrency(inv.total, inv.currency)}</td>
                      <td className="px-3 py-2">{formatCurrency(inv.balance, inv.currency)}</td>
                      <td className="px-3 py-2">
                        {t(`invoice.status.${inv.status ?? "draft"}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted page-subtitle">{t("customers.statementEmpty")}</p>
        )}
      </div>
    </div>
  );
}
