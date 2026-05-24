"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

type LedgerLine = {
  entryId: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId?: string | null;
  debit: number;
  credit: number;
  balance: number;
};

type LedgerResponse = {
  account: { id: string; code: string; name: string; type: string };
  openingBalance: number;
  closingBalance: number;
  lines: LedgerLine[];
  range: { startDate: string | null; endDate: string | null };
};

const sourceTypeKeys: Record<string, string> = {
  sales_invoice: "reports.ledger.source.salesInvoice",
  sales_invoice_cancel: "reports.ledger.source.salesInvoiceCancel",
  invoice_payment: "reports.ledger.source.invoicePayment",
  payment_receipt: "reports.ledger.source.paymentReceipt",
  purchase_bill: "reports.ledger.source.purchaseBill",
  purchase_bill_cancel: "reports.ledger.source.purchaseBillCancel",
  bill_payment: "reports.ledger.source.billPayment",
  vendor_payment: "reports.ledger.source.vendorPayment",
  vendor_credit_note: "reports.ledger.source.vendorCreditNote",
  sales_credit_note: "reports.ledger.source.salesCreditNote",
  expense: "reports.ledger.source.expense",
  expense_reimbursement: "reports.ledger.source.expenseReimbursement",
  bank_transfer: "reports.ledger.source.bankTransfer",
  cash_adjustment: "reports.ledger.source.cashAdjustment",
  manual: "reports.ledger.source.manual",
  manual_reversal: "reports.ledger.source.manualReversal",
};

const sourceLinkMap: Record<string, (sourceId: string) => string> = {
  sales_invoice: (sourceId) => `/sales/invoices/${sourceId}`,
  sales_invoice_cancel: (sourceId) => `/sales/invoices/${sourceId}`,
  sales_credit_note: (sourceId) => `/sales/credit-notes/${sourceId}`,
  purchase_bill: (sourceId) => `/purchases/bills/${sourceId}`,
  purchase_bill_cancel: (sourceId) => `/purchases/bills/${sourceId}`,
  vendor_credit_note: (sourceId) => `/purchases/vendor-credit-notes/${sourceId}`,
  expense: (sourceId) => `/purchases/expenses/${sourceId}`,
  expense_reimbursement: (sourceId) => `/purchases/expenses/${sourceId}`,
};

export default function GeneralLedgerPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const searchParams = useSearchParams();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const { formatNumber, formatDate } = useLocaleFormatters();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const paramsApplied = useRef(false);

  const formatAmount = (value: number) =>
    formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const accountOptions = useMemo(
    () => accounts.filter((account) => account.isPosting && account.status === "active"),
    [accounts]
  );

  const loadAccounts = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/coa?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((payload) => {
        setAccounts(payload.accounts ?? []);
        if (!accountId && payload.accounts?.length) {
          const firstPosting = payload.accounts.find(
            (entry: Account) => entry.isPosting && entry.status === "active"
          );
          setAccountId(firstPosting?.id ?? "");
        }
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId, accountId]);

  const loadLedger = useCallback(() => {
    if (!activeCompanyId || !accountId) {
      setErrorKey("reports.ledger.selectAccount");
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      accountId,
    });
    if (startDate) {
      params.set("startDate", startDate);
    }
    if (endDate) {
      params.set("endDate", endDate);
    }
    setErrorKey(null);
    startTransition(() => {
      fetch(`/api/reports/general-ledger?${params.toString()}`)
        .then((res) => res.json())
        .then((payload) => {
          if (payload?.error) {
            setErrorKey("error.loadFailed");
            return;
          }
          setLedger(payload);
        })
        .catch(() => setErrorKey("error.loadFailed"));
    });
  }, [activeCompanyId, accountId, endDate, startDate, startTransition]);

  const handleExport = (format: "csv" | "pdf") => {
    if (!activeCompanyId || !accountId) {
      setErrorKey("reports.ledger.selectAccount");
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      accountId,
      format,
    });
    if (startDate) {
      params.set("startDate", startDate);
    }
    if (endDate) {
      params.set("endDate", endDate);
    }
    startTransition(async () => {
      const response = await fetch(`/api/reports/general-ledger/export?${params}`);
      if (!response.ok) {
        setErrorKey("reports.exportFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "pdf" ? "general-ledger.pdf" : "general-ledger.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (accountId) {
      loadLedger();
    }
  }, [accountId, loadLedger]);

  useEffect(() => {
    if (paramsApplied.current) {
      return;
    }
    const paramAccountId = searchParams.get("accountId");
    const paramStartDate = searchParams.get("startDate");
    const paramEndDate = searchParams.get("endDate");
    if (paramAccountId && !accountId) {
      setAccountId(paramAccountId);
    }
    if (paramStartDate && !startDate) {
      setStartDate(paramStartDate);
    }
    if (paramEndDate && !endDate) {
      setEndDate(paramEndDate);
    }
    paramsApplied.current = true;
  }, [searchParams, accountId, startDate, endDate]);

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("reports.ledger.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("reports.ledger.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-end gap-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.ledger.account")}
            </span>
            <select
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">{t("reports.ledger.accountPlaceholder")}</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.ledger.startDate")}
            </span>
            <input
              type="date"
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("reports.ledger.endDate")}
            </span>
            <input
              type="date"
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={loadLedger}
            disabled={isPending}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("reports.ledger.view")}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.ledger.exportCsv")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={isPending}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("reports.ledger.exportPdf")}
          </button>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
      </div>

      {ledger ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.ledger.openingBalance")}</p>
            <p className="text-xl font-semibold">
              {formatAmount(ledger.openingBalance)}
            </p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.ledger.closingBalance")}</p>
            <p className="text-xl font-semibold">
              {formatAmount(ledger.closingBalance)}
            </p>
          </div>
          <div className="app-panel p-4">
            <p className="text-xs text-muted">{t("reports.ledger.entries")}</p>
            <p className="text-xl font-semibold">{ledger.lines.length}</p>
          </div>
        </div>
      ) : null}

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("reports.ledger.tableTitle")}
        </div>
        {!ledger || ledger.lines.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("reports.ledger.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.ledger.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.ledger.memo")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.ledger.source")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.ledger.debit")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.ledger.credit")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reports.ledger.balance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledger.lines.map((line) => {
                  const sourceKey = sourceTypeKeys[line.sourceType];
                  const label = sourceKey ? t(sourceKey) : line.sourceType;
                  const linkBuilder = line.sourceId
                    ? sourceLinkMap[line.sourceType]
                    : undefined;
                  const href = line.sourceId && linkBuilder ? linkBuilder(line.sourceId) : null;
                  return (
                    <tr key={`${line.entryId}-${line.date}-${line.debit}-${line.credit}`}>
                      <td className="px-4 py-2">{formatDate(line.date)}</td>
                      <td className="px-4 py-2">{line.memo || "-"}</td>
                      <td className="px-4 py-2">
                        {href ? (
                          <Link
                            href={href}
                            className="text-xs font-semibold text-primary underline decoration-dotted"
                          >
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </td>
                      <td className="px-4 py-2">{formatAmount(line.debit)}</td>
                      <td className="px-4 py-2">{formatAmount(line.credit)}</td>
                      <td className="px-4 py-2">{formatAmount(line.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
