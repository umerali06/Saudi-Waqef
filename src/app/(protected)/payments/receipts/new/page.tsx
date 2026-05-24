"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type Customer = {
  id: string;
  name: string;
  currency?: string;
  status: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  balance: number;
  currency: string;
};

type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  isSystem: boolean;
};

type CashBankAccount = {
  id: string;
  accountId: string;
  name: string;
  type: "cash" | "bank";
  status: "active" | "inactive";
};

const mapReceiptError = (error?: string) => {
  switch (error) {
    case "Invalid customer":
      return "receipt.invalidCustomer";
    case "Customer is blacklisted":
      return "receipt.customerBlocked";
    case "Invalid payment account":
      return "receipt.invalidAccount";
    case "Missing receivable account":
      return "receipt.missingReceivable";
    case "Invalid invoice":
      return "receipt.invalidInvoice";
    case "Invoice is locked":
      return "receipt.invoiceLocked";
    case "Amount exceeds balance":
      return "receipt.amountExceedsBalance";
    case "Applied exceeds total":
      return "receipt.appliedExceedsTotal";
    default:
      return "error.saveFailed";
  }
};

export default function NewReceiptPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const router = useRouter();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const methodOptions = useMemo(
    () => methods.filter((entry) => entry.status === "active"),
    [methods]
  );

  const accountOptions = useMemo(
    () => accounts.filter((entry) => entry.status === "active"),
    [accounts]
  );

  const appliedAmount = useMemo(() => {
    return invoices.reduce((sum, invoice) => {
      const value = Number(allocations[invoice.id] ?? 0);
      return Number.isNaN(value) ? sum : sum + value;
    }, 0);
  }, [allocations, invoices]);

  const numericTotal = Number(totalAmount) || 0;
  const unappliedAmount = Math.max(numericTotal - appliedAmount, 0);

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || "SAR",
    }).format(value);

  const formatDate = (value?: string) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
    }).format(date);
  };

  const formatMethod = (entry: PaymentMethod) =>
    entry.isSystem ? t(`payment.method.${entry.code}`) : entry.name;

  const loadLookups = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    Promise.all([
      fetch(`/api/customers?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/payment-methods?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/cash-bank-accounts?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([customerData, methodData, accountData]) => {
        setCustomers(customerData.customers ?? []);
        setMethods(methodData.methods ?? []);
        setAccounts(accountData.accounts ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

  const loadInvoices = useCallback(() => {
    if (!activeCompanyId || !customerId) {
      setInvoices([]);
      return;
    }
    fetch(`/api/invoices?companyId=${activeCompanyId}&customerId=${customerId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = (data.invoices ?? []).filter(
          (invoice: Invoice) =>
            !["draft", "canceled"].includes(invoice.status) && invoice.balance > 0
        );
        setInvoices(list);
        setAllocations({});
      })
      .catch(() => setInvoices([]));
  }, [activeCompanyId, customerId]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (!receiptDate) {
      setReceiptDate(new Date().toISOString().slice(0, 10));
    }
  }, [receiptDate]);

  useEffect(() => {
    if (!methodOptions.length || method) {
      return;
    }
    setMethod(methodOptions[0]?.code ?? "");
  }, [methodOptions, method]);

  useEffect(() => {
    if (!accountOptions.length || accountId) {
      return;
    }
    setAccountId(accountOptions[0]?.accountId ?? "");
  }, [accountOptions, accountId]);

  const handleAllocationChange = (invoiceId: string, value: string) => {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    if (!customerId) {
      setErrorKey("receipt.invalidCustomer");
      return;
    }
    if (!method) {
      setErrorKey("receipt.invalidMethod");
      return;
    }
    if (!accountId) {
      setErrorKey("receipt.invalidAccount");
      return;
    }
    if (!numericTotal || numericTotal <= 0) {
      setErrorKey("receipt.invalidAmount");
      return;
    }

    const allocationList = invoices
      .map((invoice) => {
        const amount = Number(allocations[invoice.id] ?? 0);
        return Number.isNaN(amount) || amount <= 0
          ? null
          : { invoiceId: invoice.id, amount };
      })
      .filter(Boolean);

    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/payments/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          receiptDate,
          customerId,
          method,
          accountId,
          reference: reference || null,
          totalAmount: numericTotal,
          allocations: allocationList,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapReceiptError(data?.error));
        return;
      }
      if (data?.receiptId) {
        router.push(`/payments/receipts/${data.receiptId}`);
      }
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("receipt.createTitle")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("receipt.createSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("receipt.customer")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
            >
              <option value="">{t("receipt.selectCustomer")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("receipt.date")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={receiptDate}
              onChange={(event) => setReceiptDate(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("receipt.total")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={totalAmount}
              onChange={(event) => setTotalAmount(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("receipt.method")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              required
            >
              <option value="">{t("receipt.selectMethod")}</option>
              {methodOptions.map((entry) => (
                <option key={entry.id} value={entry.code}>
                  {formatMethod(entry)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("receipt.account")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              required
            >
              <option value="">{t("common.none")}</option>
              {accountOptions.map((entry) => (
                <option key={entry.id} value={entry.accountId}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.reference")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={t("receipt.referencePlaceholder")}
            />
          </label>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold">{t("receipt.allocations")}</h2>
          {invoices.length === 0 ? (
            <p className="mt-2 text-sm text-muted page-subtitle">{t("receipt.noInvoices")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("receipt.invoice")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.balance")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("receipt.applyAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-3 py-2 font-semibold">{invoice.invoiceNumber}</td>
                      <td className="px-3 py-2">{formatDate(invoice.invoiceDate)}</td>
                      <td className="px-3 py-2">{formatDate(invoice.dueDate)}</td>
                      <td className="px-3 py-2">
                        {formatCurrency(invoice.balance, invoice.currency)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                          value={allocations[invoice.id] ?? ""}
                          onChange={(event) =>
                            handleAllocationChange(invoice.id, event.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.applied")}</p>
            <p className="mt-1 font-semibold">{formatCurrency(appliedAmount)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("receipt.unapplied")}</p>
            <p className="mt-1 font-semibold">{formatCurrency(unappliedAmount)}</p>
          </div>
        </div>

        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}

        <button
          type="submit"
          className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("receipt.save")}
        </button>
      </form>
    </section>
  );
}
