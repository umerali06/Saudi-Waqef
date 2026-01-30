"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type Vendor = {
  id: string;
  name: string;
  status: "active" | "inactive";
  currency?: string;
};

type Bill = {
  id: string;
  billNumber: string;
  billDate: string;
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

const mapPaymentError = (error?: string) => {
  switch (error) {
    case "Invalid vendor":
      return "vendorPayment.invalidVendor";
    case "Vendor is inactive":
      return "vendorPayment.vendorInactive";
    case "Invalid payment account":
      return "vendorPayment.invalidAccount";
    case "Missing payable account":
      return "vendorPayment.missingPayable";
    case "Invalid bill":
      return "vendorPayment.invalidBill";
    case "Bill is locked":
      return "vendorPayment.billLocked";
    case "Amount exceeds balance":
      return "vendorPayment.amountExceedsBalance";
    case "Applied exceeds total":
      return "vendorPayment.appliedExceedsTotal";
    default:
      return "error.saveFailed";
  }
};

export default function NewVendorPaymentPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const router = useRouter();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
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
    return bills.reduce((sum, bill) => {
      const value = Number(allocations[bill.id] ?? 0);
      return Number.isNaN(value) ? sum : sum + value;
    }, 0);
  }, [allocations, bills]);

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
      fetch(`/api/vendors?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/payment-methods?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/cash-bank-accounts?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([vendorData, methodData, accountData]) => {
        setVendors(vendorData.vendors ?? []);
        setMethods(methodData.methods ?? []);
        setAccounts(accountData.accounts ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

  const loadBills = useCallback(() => {
    if (!activeCompanyId || !vendorId) {
      setBills([]);
      return;
    }
    fetch(`/api/bills?companyId=${activeCompanyId}&vendorId=${vendorId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = (data.bills ?? []).filter(
          (bill: Bill) => !["draft", "canceled"].includes(bill.status) && bill.balance > 0
        );
        setBills(list);
        setAllocations({});
      })
      .catch(() => setBills([]));
  }, [activeCompanyId, vendorId]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  useEffect(() => {
    if (!paymentDate) {
      setPaymentDate(new Date().toISOString().slice(0, 10));
    }
  }, [paymentDate]);

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

  const handleAllocationChange = (billId: string, value: string) => {
    setAllocations((prev) => ({ ...prev, [billId]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    if (!vendorId) {
      setErrorKey("vendorPayment.invalidVendor");
      return;
    }
    if (!method) {
      setErrorKey("vendorPayment.invalidMethod");
      return;
    }
    if (!accountId) {
      setErrorKey("vendorPayment.invalidAccount");
      return;
    }
    if (!numericTotal || numericTotal <= 0) {
      setErrorKey("vendorPayment.invalidAmount");
      return;
    }

    const allocationList = bills
      .map((bill) => {
        const amount = Number(allocations[bill.id] ?? 0);
        return Number.isNaN(amount) || amount <= 0 ? null : { billId: bill.id, amount };
      })
      .filter(Boolean);

    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/payments/vendor-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          paymentDate,
          vendorId,
          method,
          accountId,
          reference: reference || null,
          totalAmount: numericTotal,
          allocations: allocationList,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPaymentError(data?.error));
        return;
      }
      if (data?.paymentId) {
        router.push(`/payments/vendor-payments/${data.paymentId}`);
      }
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("vendorPayment.createTitle")}</h1>
        <p className="text-sm text-muted">{t("vendorPayment.createSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="app-card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorPayment.vendor")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
              required
            >
              <option value="">{t("vendorPayment.selectVendor")}</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorPayment.date")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorPayment.total")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={totalAmount}
              onChange={(event) => setTotalAmount(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorPayment.method")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              required
            >
              <option value="">{t("vendorPayment.selectMethod")}</option>
              {methodOptions.map((entry) => (
                <option key={entry.id} value={entry.code}>
                  {formatMethod(entry)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorPayment.account")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={t("vendorPayment.referencePlaceholder")}
            />
          </label>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold">{t("vendorPayment.allocations")}</h2>
          {bills.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("vendorPayment.noBills")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted text-muted">
                  <tr>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("vendorPayment.bill")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.balance")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("vendorPayment.applyAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td className="px-3 py-2 font-semibold">{bill.billNumber}</td>
                      <td className="px-3 py-2">{formatDate(bill.billDate)}</td>
                      <td className="px-3 py-2">{formatDate(bill.dueDate)}</td>
                      <td className="px-3 py-2">
                        {formatCurrency(bill.balance, bill.currency)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                          value={allocations[bill.id] ?? ""}
                          onChange={(event) => handleAllocationChange(bill.id, event.target.value)}
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
          <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.applied")}</p>
            <p className="mt-1 font-semibold">{formatCurrency(appliedAmount)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p className="text-xs text-muted">{t("vendorPayment.unapplied")}</p>
            <p className="mt-1 font-semibold">{formatCurrency(unappliedAmount)}</p>
          </div>
        </div>

        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}

        <button
          type="submit"
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("vendorPayment.save")}
        </button>
      </form>
    </section>
  );
}
