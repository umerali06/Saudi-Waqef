"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type ExpenseCategory = {
  id: string;
  name: string;
  expenseAccountId: string;
  status: "active" | "inactive";
};

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
};

const mapCategoryError = (error?: string) => {
  switch (error) {
    case "Invalid account":
      return "expenseCategory.invalidAccount";
    default:
      return "error.saveFailed";
  }
};

export default function ExpenseCategoriesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("status.active") },
      { value: "inactive", label: t("status.inactive") },
    ],
    [t]
  );

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    Promise.all([
      fetch(`/api/expense-categories?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([categoryData, accountsData]) => {
        setCategories(categoryData.categories ?? []);
        setAccounts(
          (accountsData.accounts ?? []).filter((account: Account) => account.isPosting)
        );
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!accounts.length || accountId) {
      return;
    }
    setAccountId(accounts[0]?.id ?? "");
  }, [accounts, accountId]);

  const resetForm = () => {
    setName("");
    setAccountId("");
    setStatus("active");
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!name.trim()) {
      setErrorKey("expenseCategory.missingName");
      return;
    }
    if (!accountId) {
      setErrorKey("expenseCategory.invalidAccount");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(
        editingId ? `/api/expense-categories/${editingId}` : "/api/expense-categories",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editingId ? {} : { companyId: activeCompanyId }),
            name: name.trim(),
            expenseAccountId: accountId,
            status,
          }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorKey(mapCategoryError(payload?.error));
        return;
      }
      resetForm();
      loadData();
    });
  };

  const handleEdit = (category: ExpenseCategory) => {
    setEditingId(category.id);
    setName(category.name);
    setAccountId(category.expenseAccountId);
    setStatus(category.status);
  };

  const handleStatusToggle = (category: ExpenseCategory) => {
    if (!activeCompanyId) {
      return;
    }
    const nextStatus = category.status === "active" ? "inactive" : "active";
    startTransition(async () => {
      await fetch(`/api/expense-categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      loadData();
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("expenseCategory.title")}</h1>
        <p className="text-sm text-muted">{t("expenseCategory.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expenseCategory.name")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("expenseCategory.account")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
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
            <span className="mb-1 block text-xs text-muted">{t("expenseCategory.status")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editingId ? t("expenseCategory.update") : t("expenseCategory.create")}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("expenseCategory.listTitle")}</span>
          <span className="text-xs text-muted">{categories.length}</span>
        </div>
        {categories.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("expenseCategory.empty")}</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expenseCategory.name")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>
                    {t("expenseCategory.account")}
                  </th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("expenseCategory.status")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const account = accounts.find(
                    (entry) => entry.id === category.expenseAccountId
                  );
                  return (
                    <tr key={category.id} className="border-t border-border">
                      <td className="px-3 py-2">{category.name}</td>
                      <td className="px-3 py-2">
                        {account ? `${account.code} - ${account.name}` : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {t(`status.${category.status ?? "active"}`)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(category)}
                            className="text-xs text-primary hover:underline"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(category)}
                            className="text-xs text-muted hover:underline"
                          >
                            {category.status === "active"
                              ? t("expenseCategory.deactivate")
                              : t("expenseCategory.activate")}
                          </button>
                        </div>
                      </td>
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
