"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { calculateLineAmounts } from "@/lib/utils/invoice";

type Vendor = {
  id: string;
  name: string;
  status: "active" | "inactive";
};

type ExpenseCategory = {
  id: string;
  name: string;
  status: "active" | "inactive";
};

type TaxCategory = {
  id: string;
  name: string;
  rate: number;
  type: "standard" | "zero" | "exempt";
  status: "active" | "inactive";
};

type CompanyDefaults = {
  defaultPurchaseTaxCategoryId: string | null;
};

type CompanyConfig = {
  taxInclusive: boolean;
};

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
};

const mapExpenseError = (error?: string) => {
  switch (error) {
    case "Invalid category":
      return "expense.invalidCategory";
    case "Category is inactive":
      return "expense.categoryInactive";
    case "Invalid vendor":
      return "expense.invalidVendor";
    case "Vendor is inactive":
      return "expense.vendorInactive";
    case "Missing payment account":
      return "expense.missingPaymentAccount";
    case "VAT period is filed":
      return "vat.periodLocked";
    default:
      return "error.saveFailed";
  }
};

export default function NewExpensePage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const router = useRouter();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [taxCategoryId, setTaxCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [reimbursable, setReimbursable] = useState(false);
  const [reimburseTo, setReimburseTo] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const taxMap = useMemo(
    () => new Map(taxCategories.map((tax) => [tax.id, tax])),
    [taxCategories]
  );

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    Promise.all([
      fetch(`/api/vendors?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/expense-categories?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/tax-categories?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/company-defaults?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(
        ([
          vendorData,
          categoryData,
          taxData,
          defaultsData,
          configData,
          accountsData,
        ]) => {
          setVendors(vendorData.vendors ?? []);
          setCategories(
            (categoryData.categories ?? []).filter(
              (category: ExpenseCategory) => category.status === "active"
            )
          );
          setTaxCategories(
            (taxData.categories ?? []).filter(
              (category: TaxCategory) => category.status === "active"
            )
          );
          setDefaults(defaultsData.defaults ?? null);
          setConfig({ taxInclusive: Boolean(configData?.config?.taxInclusive) });
          const postingAccounts = (accountsData.accounts ?? []).filter(
            (account: Account) => account.isPosting
          );
          setAccounts(postingAccounts);
        }
      )
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (defaults?.defaultPurchaseTaxCategoryId && !taxCategoryId) {
      setTaxCategoryId(defaults.defaultPurchaseTaxCategoryId);
    }
  }, [defaults, taxCategoryId]);

  useEffect(() => {
    if (!accounts.length || paymentAccountId) {
      return;
    }
    setPaymentAccountId(accounts[0]?.id ?? "");
  }, [accounts, paymentAccountId]);

  const totals = useMemo(() => {
    const value = Number(amount) || 0;
    const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
    const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;
    const amounts = calculateLineAmounts({
      quantity: 1,
      unitPrice: value,
      discountRate: 0,
      taxRate,
      taxInclusive: Boolean(config?.taxInclusive),
    });
    return amounts;
  }, [amount, taxCategoryId, taxMap, config]);

  const handleSave = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!categoryId) {
      setErrorKey("expense.selectCategory");
      return;
    }
    const amountValue = Number(amount);
    if (!amountValue || amountValue <= 0) {
      setErrorKey("expense.invalidAmount");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          expenseDate,
          categoryId,
          vendorId: vendorId || null,
          paymentMethod,
          paymentAccountId: reimbursable ? null : paymentAccountId || null,
          taxCategoryId: taxCategoryId || null,
          amount: amountValue,
          description: description || null,
          notes: notes || null,
          reimbursable,
          reimburseTo: reimbursable ? reimburseTo || null : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorKey(mapExpenseError(payload?.error));
        return;
      }

      const data = await response.json().catch(() => ({}));
      router.push(`/purchases/expenses/${data.expenseId}`);
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("expense.createTitle")}</h1>
        <p className="text-sm text-muted">{t("expense.createSubtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.date")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.category")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">{t("expense.selectCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.vendor")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.paymentMethod")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="cash">{t("expense.paymentMethod.cash")}</option>
              <option value="bank">{t("expense.paymentMethod.bank")}</option>
              <option value="card">{t("expense.paymentMethod.card")}</option>
              <option value="cheque">{t("expense.paymentMethod.cheque")}</option>
              <option value="online">{t("expense.paymentMethod.online")}</option>
              <option value="other">{t("expense.paymentMethod.other")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.paymentAccount")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(event.target.value)}
              disabled={reimbursable}
            >
              <option value="">{t("common.none")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
            {reimbursable ? (
              <p className="mt-1 text-xs text-muted">{t("expense.reimbursableHint")}</p>
            ) : null}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.taxCategory")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={taxCategoryId}
              onChange={(event) => setTaxCategoryId(event.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {taxCategories.map((tax) => (
                <option key={tax.id} value={tax.id}>
                  {tax.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              {config?.taxInclusive ? t("expense.taxInclusive") : t("expense.taxExclusive")}
            </p>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.amount")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.description")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reimbursable}
              onChange={(event) => setReimbursable(event.target.checked)}
            />
            {t("expense.reimbursable")}
          </label>
          {reimbursable ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("expense.reimburseTo")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={reimburseTo}
                onChange={(event) => setReimburseTo(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="app-card p-4">
        <div className="flex flex-wrap justify-between gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted">{t("expense.subtotal")}</p>
            <p className="font-semibold">{totals.netAmount.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted">{t("expense.taxTotal")}</p>
            <p className="font-semibold">{totals.taxAmount.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted">{t("expense.total")}</p>
            <p className="font-semibold">{totals.totalAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("expense.saveDraft")}
        </button>
      </div>
    </section>
  );
}
