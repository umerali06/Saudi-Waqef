"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type CashBankAccount = {
  id: string;
  accountId: string;
  name: string;
  type: "cash" | "bank";
  status: "active" | "inactive";
  openingBalance: number;
  bankName?: string | null;
  iban?: string | null;
};

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

const mapAccountError = (error?: string) => {
  switch (error) {
    case "Invalid account":
      return "payments.accounts.invalidAccount";
    default:
      return "error.saveFailed";
  }
};

export default function CashBankAccountsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<Account[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState<"cash" | "bank">("cash");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
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

  const accountOptions = useMemo(
    () =>
      coaAccounts.filter(
        (account) => account.isPosting && account.status === "active" && account.type === "asset"
      ),
    [coaAccounts]
  );

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingData(true);
    Promise.all([
      fetch(`/api/cash-bank-accounts?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([accountData, coaData]) => {
        setAccounts(accountData.accounts ?? []);
        setCoaAccounts(coaData.accounts ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingData(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!accountOptions.length || accountId) {
      return;
    }
    setAccountId(accountOptions[0]?.id ?? "");
  }, [accountOptions, accountId]);

  const resetForm = () => {
    setName("");
    setAccountId("");
    setType("cash");
    setStatus("active");
    setOpeningBalance("0");
    setBankName("");
    setIban("");
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!name.trim()) {
      setErrorKey("payments.accounts.missingName");
      return;
    }
    if (!accountId) {
      setErrorKey("payments.accounts.invalidAccount");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const payload = {
        ...(editingId ? {} : { companyId: activeCompanyId }),
        name: name.trim(),
        accountId,
        type,
        status,
        openingBalance: Number(openingBalance) || 0,
        bankName: type === "bank" ? bankName || null : null,
        iban: type === "bank" ? iban || null : null,
      };
      const response = await fetch(
        editingId ? `/api/cash-bank-accounts/${editingId}` : "/api/cash-bank-accounts",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapAccountError(data?.error));
        return;
      }
      resetForm();
      loadData();
    });
  };

  const handleEdit = (account: CashBankAccount) => {
    setEditingId(account.id);
    setName(account.name);
    setAccountId(account.accountId);
    setType(account.type);
    setStatus(account.status);
    setOpeningBalance(String(account.openingBalance ?? 0));
    setBankName(account.bankName ?? "");
    setIban(account.iban ?? "");
  };

  const handleStatusToggle = (account: CashBankAccount) => {
    startTransition(async () => {
      await fetch(`/api/cash-bank-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: account.status === "active" ? "inactive" : "active" }),
      });
      loadData();
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("payments.accounts.title")}</h1>
        <p className="text-sm text-muted">{t("payments.accounts.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("payments.accounts.name")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("payments.accounts.account")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("payments.accounts.type")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value as "cash" | "bank")}
            >
              <option value="cash">{t("payments.accounts.type.cash")}</option>
              <option value="bank">{t("payments.accounts.type.bank")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("payments.accounts.status")}</span>
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
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("payments.accounts.openingBalance")}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
          </label>
          {type === "bank" ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("payments.accounts.bankName")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
              />
            </label>
          ) : null}
          {type === "bank" ? (
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payments.accounts.iban")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={iban}
                onChange={(event) => setIban(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {editingId ? t("payments.accounts.update") : t("payments.accounts.create")}
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
          <span>{t("payments.accounts.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingData ? "—" : accounts.length}
          </span>
        </div>
        {loadingData ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("payments.accounts.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.accounts.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.accounts.type")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.accounts.account")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.accounts.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((entry) => {
                  const linked = coaAccounts.find((coa) => coa.id === entry.accountId);
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2 font-semibold">{entry.name}</td>
                      <td className="px-4 py-2">
                        {entry.type === "cash"
                          ? t("payments.accounts.type.cash")
                          : t("payments.accounts.type.bank")}
                      </td>
                      <td className="px-4 py-2">
                        {linked ? `${linked.code} - ${linked.name}` : "-"}
                      </td>
                      <td className="px-4 py-2">
                        {t(`status.${entry.status ?? "active"}`)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className="font-semibold text-primary"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(entry)}
                            className="font-semibold text-muted"
                          >
                            {entry.status === "active"
                              ? t("payments.accounts.deactivate")
                              : t("payments.accounts.activate")}
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
