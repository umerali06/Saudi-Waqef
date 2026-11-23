"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "@/i18n/provider";

type OpenDocument = {
  id: string;
  number: string;
  dueDate: string;
  balance: number;
};

const mapApplyError = (error?: string) => {
  switch (error) {
    case "Amount exceeds credit":
      return "credit.exceedsCredit";
    case "Amount exceeds balance":
      return "credit.exceedsBalance";
    default:
      return "error.saveFailed";
  }
};

/** Settles open invoices or bills with a credit the customer or vendor already has. */
export function ApplyCreditPanel(props: {
  openItemId: string;
  companyId: string;
  partyType: "customer" | "vendor";
  partyId: string;
  available: number;
  currency: string;
  onApplied: () => void;
}) {
  const { openItemId, companyId, partyType, partyId, available, currency, onApplied } = props;
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", {
      style: "currency",
      currency,
    }).format(value);

  const loadDocuments = useCallback(() => {
    const url =
      partyType === "customer"
        ? `/api/invoices?companyId=${companyId}&customerId=${partyId}`
        : `/api/bills?companyId=${companyId}&vendorId=${partyId}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const rows = (data.invoices ?? data.bills ?? []) as Array<{
          id: string;
          invoiceNumber?: string;
          billNumber?: string;
          status: string;
          dueDate: string;
          balance: number;
        }>;
        setDocuments(
          rows
            .filter((row) => !["draft", "canceled"].includes(row.status) && row.balance > 0)
            .map((row) => ({
              id: row.id,
              number: row.invoiceNumber ?? row.billNumber ?? "",
              dueDate: row.dueDate,
              balance: row.balance,
            }))
        );
      })
      .catch(() => setDocuments([]));
  }, [companyId, partyId, partyType]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleApply = () => {
    const allocations = documents
      .map((document) => ({
        documentId: document.id,
        amount: Number(amounts[document.id] ?? 0),
      }))
      .filter((allocation) => allocation.amount > 0);
    if (allocations.length === 0) {
      setErrorKey("credit.enterAmount");
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/open-items/${openItemId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, allocations }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapApplyError(data?.error));
        return;
      }
      setAmounts({});
      loadDocuments();
      onApplied();
    });
  };

  return (
    <div className="app-card p-6 card-modern">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("credit.applyTitle")}</h2>
        <span className="text-xs text-muted">
          {t("credit.available")}: {formatCurrency(available)}
        </span>
      </div>
      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("credit.noOpenDocuments")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm table-modern">
            <thead className="bg-surface-muted text-muted thead-modern">
              <tr>
                <th className={`px-4 py-2 ${alignClass}`}>{t("credit.document")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("credit.balance")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("credit.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((document) => (
                <tr key={document.id}>
                  <td className="px-4 py-2 font-semibold">{document.number}</td>
                  <td className="px-4 py-2">{document.dueDate}</td>
                  <td className="px-4 py-2">{formatCurrency(document.balance)}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`${t("credit.amount")} ${document.number}`}
                      className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                      value={amounts[document.id] ?? ""}
                      onChange={(event) =>
                        setAmounts((prev) => ({ ...prev, [document.id]: event.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {errorKey ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {documents.length > 0 ? (
        <button
          type="button"
          onClick={handleApply}
          className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
          disabled={isPending}
        >
          {t("credit.apply")}
        </button>
      ) : null}
    </div>
  );
}
