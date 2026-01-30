"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type ExpenseListItem = {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  vendorId?: string | null;
  vendorName?: string | null;
  status: string;
  paymentMethod: string;
  reimbursable: boolean;
  reimbursementStatus?: string | null;
  total: number;
  currency: string;
};

type ExpenseCategory = {
  id: string;
  name: string;
  status: "active" | "inactive";
};

export default function ExpensesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [reimbursableFilter, setReimbursableFilter] = useState("all");
  const [reimbursementFilter, setReimbursementFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || "SAR",
    }).format(value);

  const formatDate = (value: string) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
    }).format(date);
  };

  const loadCategories = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingCategories(true);
    fetch(`/api/expense-categories?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]))
      .finally(() => setLoadingCategories(false));
  }, [activeCompanyId]);

  const loadExpenses = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingExpenses(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (categoryFilter !== "all") {
      params.set("categoryId", categoryFilter);
    }
    if (paymentFilter !== "all") {
      params.set("paymentMethod", paymentFilter);
    }
    if (reimbursableFilter !== "all") {
      params.set("reimbursable", reimbursableFilter === "yes" ? "true" : "false");
    }
    if (reimbursementFilter !== "all") {
      params.set("reimbursementStatus", reimbursementFilter);
    }
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/expenses?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const next = data.expenses ?? [];
        setExpenses(next);
        setSelectedIds((prev) =>
          prev.filter((id) => next.some((item: { id: string }) => item.id === id))
        );
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingExpenses(false));
  }, [
    activeCompanyId,
    categoryFilter,
    fromDate,
    paymentFilter,
    query,
    reimbursableFilter,
    reimbursementFilter,
    statusFilter,
    toDate,
  ]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const statusOptions = useMemo(
    () => [
      { value: "draft", label: t("expense.status.draft") },
      { value: "approved", label: t("expense.status.approved") },
    ],
    [t]
  );

  const paymentOptions = useMemo(
    () => [
      { value: "cash", label: t("expense.paymentMethod.cash") },
      { value: "bank", label: t("expense.paymentMethod.bank") },
      { value: "card", label: t("expense.paymentMethod.card") },
      { value: "cheque", label: t("expense.paymentMethod.cheque") },
      { value: "online", label: t("expense.paymentMethod.online") },
      { value: "other", label: t("expense.paymentMethod.other") },
    ],
    [t]
  );

  const reimbursementOptions = useMemo(
    () => [
      { value: "pending", label: t("expense.reimbursement.pending") },
      { value: "paid", label: t("expense.reimbursement.paid") },
    ],
    [t]
  );

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(expenses.map((expense) => expense.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (expenseId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, expenseId] : prev.filter((id) => id !== expenseId)
    );
  };

  const exportCsv = () => {
    const headers = [
      t("expense.number"),
      t("expense.date"),
      t("expense.category"),
      t("expense.vendor"),
      t("expense.amount"),
      t("expense.status"),
      t("expense.paymentMethod"),
      t("expense.reimbursable"),
      t("expense.reimbursementStatus"),
    ];
    const rows = expenses.map((expense) => [
      expense.expenseNumber,
      expense.expenseDate,
      expense.categoryName,
      expense.vendorName ?? "",
      expense.total.toFixed(2),
      t(`expense.status.${expense.status ?? "draft"}`),
      t(`expense.paymentMethod.${expense.paymentMethod}`),
      expense.reimbursable ? t("common.yes") : t("common.no"),
      expense.reimbursementStatus
        ? t(`expense.reimbursement.${expense.reimbursementStatus}`)
        : "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/\"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "expenses.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const bulkApprove = () => {
    if (!selectedIds.length) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const results = await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/expenses/${id}/approve`, { method: "POST" }).then((res) => res.ok)
        )
      );
      if (results.some((ok) => !ok)) {
        setErrorKey("expense.bulkApproveFailed");
      }
      setSelectedIds([]);
      loadExpenses();
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("expense.title")}</h1>
          <p className="text-sm text-muted">{t("expense.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
          >
            {t("common.export")}
          </button>
          <button
            type="button"
            onClick={bulkApprove}
            disabled={!selectedIds.length || isPending}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("expense.approveSelected")}
          </button>
          <Link
            href="/purchases/expenses/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("expense.create")}
          </Link>
        </div>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("expense.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.statusFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.categoryFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              disabled={loadingCategories}
            >
              <option value="all">{t("common.all")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.paymentFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {paymentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("expense.reimbursableFilter")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={reimbursableFilter}
              onChange={(event) => setReimbursableFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              <option value="yes">{t("common.yes")}</option>
              <option value="no">{t("common.no")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("expense.reimbursementFilter")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={reimbursementFilter}
              onChange={(event) => setReimbursementFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {reimbursementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.fromDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expense.toDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("expense.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingExpenses ? "—" : expenses.length}
          </span>
        </div>
        {loadingExpenses ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("expense.empty")}</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === expenses.length}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                  </th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expense.number")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expense.date")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expense.category")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expense.vendor")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expense.amount")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expense.status")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>
                    {t("expense.reimbursementStatus")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(expense.id)}
                        onChange={(event) => toggleSelect(expense.id, event.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      <Link
                        className="text-primary hover:underline"
                        href={`/purchases/expenses/${expense.id}`}
                      >
                        {expense.expenseNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{formatDate(expense.expenseDate)}</td>
                    <td className="px-3 py-2">{expense.categoryName}</td>
                    <td className="px-3 py-2">{expense.vendorName ?? "-"}</td>
                    <td className="px-3 py-2">
                      {formatCurrency(expense.total, expense.currency)}
                    </td>
                    <td className="px-3 py-2">
                      {t(`expense.status.${expense.status ?? "draft"}`)}
                    </td>
                    <td className="px-3 py-2">
                      {expense.reimbursable
                        ? t(`expense.reimbursement.${expense.reimbursementStatus ?? "pending"}`)
                        : t("expense.reimbursement.none")}
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
