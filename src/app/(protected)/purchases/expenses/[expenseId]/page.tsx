"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { uploadToCloudinary } from "@/lib/cloudinary-client";

type ExpenseDetail = {
  id: string;
  companyId: string;
  expenseNumber: string;
  status: "draft" | "approved";
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  expenseAccountId: string;
  vendorId?: string | null;
  vendorName?: string | null;
  paymentMethod: string;
  paymentAccountId?: string | null;
  currency: string;
  amount: number;
  netAmount: number;
  taxAmount: number;
  taxRate: number;
  taxCategoryId?: string | null;
  taxInclusive: boolean;
  description?: string | null;
  notes?: string | null;
  reimbursable: boolean;
  reimbursementStatus?: "pending" | "paid" | null;
  reimburseTo?: string | null;
  reimbursementMethod?: string | null;
  reimbursementAccountId?: string | null;
  reimbursementReference?: string | null;
  approvedAt?: string | null;
  reimbursedAt?: string | null;
};

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

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
};

type Attachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storage: "cloudinary" | "firestore";
  url?: string;
  content?: string;
};

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

const mapExpenseError = (error?: string) => {
  switch (error) {
    case "Expense is locked":
      return "expense.locked";
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
    case "Missing payable account":
      return "expense.missingPayableAccount";
    case "Missing VAT input account":
      return "expense.missingVatInputAccount";
    case "Missing expense account":
      return "expense.missingExpenseAccount";
    case "Invalid payment account":
      return "expense.invalidPaymentAccount";
    case "Expense is not reimbursable":
      return "expense.reimbursementNotAllowed";
    case "Expense is not approved":
      return "expense.reimbursementNotApproved";
    case "Reimbursement already paid":
      return "expense.reimbursementAlreadyPaid";
    case "VAT period is filed":
      return "vat.periodLocked";
    default:
      return "error.saveFailed";
  }
};

export default function ExpenseDetailPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const params = useParams<{ expenseId: string }>();
  const expenseId = params.expenseId;
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingExpense, setLoadingExpense] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [expenseDate, setExpenseDate] = useState("");
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [reimburseDate, setReimburseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [reimburseMethod, setReimburseMethod] = useState("bank");
  const [reimburseAccountId, setReimburseAccountId] = useState("");
  const [reimburseReference, setReimburseReference] = useState("");

  const taxMap = useMemo(
    () => new Map(taxCategories.map((tax) => [tax.id, tax])),
    [taxCategories]
  );

  const loadExpense = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingExpense(true);
    Promise.all([
      fetch(`/api/expenses/${expenseId}`).then((res) => res.json()),
      fetch(`/api/vendors?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/expense-categories?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/tax-categories?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([expenseData, vendorData, categoryData, taxData, accountsData]) => {
        const nextExpense = expenseData.expense as ExpenseDetail | undefined;
        if (!nextExpense) {
          setExpense(null);
          return;
        }
        setExpense(nextExpense);
        setExpenseDate(nextExpense.expenseDate);
        setCategoryId(nextExpense.categoryId);
        setVendorId(nextExpense.vendorId ?? "");
        setPaymentMethod(nextExpense.paymentMethod);
        setPaymentAccountId(nextExpense.paymentAccountId ?? "");
        setTaxCategoryId(nextExpense.taxCategoryId ?? "");
        const amountValue = nextExpense.taxInclusive
          ? nextExpense.amount
          : nextExpense.netAmount;
        setAmount(amountValue.toString());
        setDescription(nextExpense.description ?? "");
        setNotes(nextExpense.notes ?? "");
        setReimbursable(Boolean(nextExpense.reimbursable));
        setReimburseTo(nextExpense.reimburseTo ?? "");
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
        setAccounts(
          (accountsData.accounts ?? []).filter((account: Account) => account.isPosting)
        );
        setTaxCategoryId(nextExpense.taxCategoryId ?? "");
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingExpense(false));
  }, [activeCompanyId, expenseId]);

  const loadAttachments = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingAttachments(true);
    fetch(`/api/expenses/${expenseId}/attachments`)
      .then((res) => res.json())
      .then((data) => setAttachments(data.attachments ?? []))
      .catch(() => setAttachments([]))
      .finally(() => setLoadingAttachments(false));
  }, [activeCompanyId, expenseId]);

  useEffect(() => {
    loadExpense();
    loadAttachments();
  }, [loadAttachments, loadExpense]);

  useEffect(() => {
    if (!accounts.length || reimburseAccountId) {
      return;
    }
    setReimburseAccountId(accounts[0]?.id ?? "");
  }, [accounts, reimburseAccountId]);

  const totals = useMemo(() => {
    const value = Number(amount) || 0;
    const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
    const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;
    const amounts = calculateLineAmounts({
      quantity: 1,
      unitPrice: value,
      discountRate: 0,
      taxRate,
      taxInclusive: Boolean(expense?.taxInclusive),
    });
    return amounts;
  }, [amount, taxCategoryId, taxMap, expense]);

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || "SAR",
    }).format(value);

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
    }).format(date);
  };

  const handleSave = () => {
    if (!expense || !activeCompanyId) {
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
    setNoticeKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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

      setNoticeKey("expense.saved");
      loadExpense();
    });
  };

  const handleApprove = () => {
    if (!expense) {
      return;
    }
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/expenses/${expense.id}/approve`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorKey(mapExpenseError(payload?.error));
        return;
      }
      loadExpense();
    });
  };

  const handleReimburse = () => {
    if (!expense || !expense.reimbursable) {
      return;
    }
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/expenses/${expense.id}/reimburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: expense.companyId,
          paymentDate: reimburseDate,
          paymentMethod: reimburseMethod,
          paymentAccountId: reimburseAccountId,
          reference: reimburseReference || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorKey(mapExpenseError(payload?.error));
        return;
      }

      loadExpense();
    });
  };

  const handleUpload = async () => {
    if (!expense || !attachmentFile) {
      return;
    }
    setErrorKey(null);
    setIsUploading(true);
    try {
      const isCloudinary =
        attachmentFile.type.startsWith("image/") ||
        attachmentFile.type === "application/pdf" ||
        attachmentFile.type.startsWith("video/");
      let payload: Record<string, unknown> = {
        companyId: expense.companyId,
        name: attachmentFile.name,
        contentType: attachmentFile.type,
        size: attachmentFile.size,
        storage: isCloudinary ? "cloudinary" : "firestore",
      };

      if (isCloudinary) {
        const url = await uploadToCloudinary(
          attachmentFile,
          `companies/${expense.companyId}/expenses/${expense.id}`
        );
        payload = { ...payload, url };
      } else {
        if (attachmentFile.size > FIRESTORE_ATTACHMENT_LIMIT) {
          setErrorKey("expense.attachmentTooLarge");
          setIsUploading(false);
          return;
        }
        const content = await attachmentFile.text();
        payload = { ...payload, content };
      }

      const response = await fetch(`/api/expenses/${expense.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.error === "Attachment too large") {
          setErrorKey("expense.attachmentTooLarge");
        } else {
          setErrorKey("expense.attachmentUploadFailed");
        }
        setIsUploading(false);
        return;
      }
      setAttachmentFile(null);
      loadAttachments();
    } catch {
      setErrorKey("expense.attachmentUploadFailed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!expense) {
      return;
    }
    await fetch(`/api/expenses/${expense.id}/attachments/${attachmentId}`, {
      method: "DELETE",
    });
    loadAttachments();
  };

  if (loadingExpense && !expense && !errorKey) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-48" />
        </div>
        <div className="app-card space-y-4 p-4">
          <SkeletonBlock className="h-5 w-40" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="app-card space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-4 w-full" />
          ))}
        </div>
        <div className="app-card space-y-3 p-4">
          <SkeletonBlock className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-8 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!expense) {
    return <div className="text-sm text-muted">{t("common.loading")}</div>;
  }

  const isLocked = expense.status !== "draft";
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("expense.detailsTitle")}</p>
          <h1 className="text-2xl font-semibold">{expense.expenseNumber}</h1>
          <p className="text-sm text-muted">
            {expense.categoryName} • {t(`expense.status.${expense.status ?? "draft"}`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/purchases/expenses"
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
          >
            {t("expense.title")}
          </Link>
          {expense.status === "draft" ? (
            <button
              type="button"
              onClick={handleApprove}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            >
              {t("expense.approve")}
            </button>
          ) : null}
        </div>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {noticeKey ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {t(noticeKey)}
        </div>
      ) : null}

      <div className="app-card p-4">
        <h2 className="text-lg font-semibold">{t("expense.detailsSubtitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.date")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              disabled={isLocked}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.category")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked || reimbursable}
            >
              <option value="">{t("common.none")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.taxCategory")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={taxCategoryId}
              onChange={(event) => setTaxCategoryId(event.target.value)}
              disabled={isLocked}
            >
              <option value="">{t("common.none")}</option>
              {taxCategories.map((tax) => (
                <option key={tax.id} value={tax.id}>
                  {tax.name}
                </option>
              ))}
            </select>
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
              disabled={isLocked}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.description")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isLocked}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isLocked}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reimbursable}
              onChange={(event) => setReimbursable(event.target.checked)}
              disabled={isLocked}
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
                disabled={isLocked}
              />
            </label>
          ) : null}
        </div>
        {expense.status === "draft" ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("expense.updateDraft")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="app-card p-4">
        <div className="flex flex-wrap justify-between gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted">{t("expense.subtotal")}</p>
            <p className="font-semibold">{formatCurrency(totals.netAmount, expense.currency)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted">{t("expense.taxTotal")}</p>
            <p className="font-semibold">{formatCurrency(totals.taxAmount, expense.currency)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted">{t("expense.total")}</p>
            <p className="font-semibold">{formatCurrency(totals.totalAmount, expense.currency)}</p>
          </div>
        </div>
      </div>

      {expense.reimbursable ? (
        <div className="app-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("expense.reimbursementTitle")}</h2>
            <span className="text-sm text-muted">
              {t(
                `expense.reimbursement.${expense.reimbursementStatus ?? "pending"}`
              )}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {t("expense.reimbursementHint")}
          </p>
          {expense.status !== "approved" ? (
            <div className="mt-4 text-sm text-muted">
              {t("expense.reimbursementNotApproved")}
            </div>
          ) : expense.reimbursementStatus === "paid" ? (
            <div className="mt-4 text-sm text-muted">
              {t("expense.reimbursedOn", { date: formatDate(expense.reimbursedAt) })}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("expense.reimburseDate")}
                </span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={reimburseDate}
                  onChange={(event) => setReimburseDate(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("expense.reimburseMethod")}
                </span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={reimburseMethod}
                  onChange={(event) => setReimburseMethod(event.target.value)}
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
                <span className="mb-1 block text-xs text-muted">
                  {t("expense.reimburseAccount")}
                </span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={reimburseAccountId}
                  onChange={(event) => setReimburseAccountId(event.target.value)}
                >
                  <option value="">{t("common.none")}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("expense.reimburseReference")}
                </span>
                <input
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={reimburseReference}
                  onChange={(event) => setReimburseReference(event.target.value)}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleReimburse}
                  disabled={isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("expense.reimburse")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="app-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("expense.attachmentsTitle")}</h2>
          <div className="flex items-center gap-2">
            <input
              type="file"
              onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={handleUpload}
              disabled={!attachmentFile || isUploading}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? t("expense.uploading") : t("expense.uploadAttachment")}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted">{t("expense.attachmentHint")}</p>
        {loadingAttachments ? (
          <div className="mt-4 space-y-3">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 3 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-8 w-full" />
            ))}
          </div>
        ) : attachments.length ? (
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th className={`px-2 py-2 ${alignClass}`}>
                    {t("expense.attachmentName")}
                  </th>
                  <th className={`px-2 py-2 ${alignClass}`}>
                    {t("expense.attachmentStorage")}
                  </th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.size")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((attachment) => (
                  <tr key={attachment.id} className="border-t border-border">
                    <td className="px-2 py-2">{attachment.name}</td>
                    <td className="px-2 py-2">
                      {attachment.storage === "cloudinary"
                        ? t("expense.storage.cloudinary")
                        : t("expense.storage.firestore")}
                    </td>
                    <td className="px-2 py-2">
                      {(attachment.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {attachment.url ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t("common.view")}
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("expense.attachmentsEmpty")}</p>
        )}
      </div>
    </section>
  );
}
