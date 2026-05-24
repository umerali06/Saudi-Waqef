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
};

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

type Adjustment = {
  id: string;
  adjustmentNumber: string;
  adjustmentDate: string;
  accountId: string;
  offsetAccountId: string;
  type: "increase" | "decrease";
  amount: number;
  reason?: string | null;
  memo?: string | null;
};

const mapAdjustmentError = (error?: string) => {
  switch (error) {
    case "Invalid account":
      return "adjustment.invalidAccount";
    case "Invalid offset account":
      return "adjustment.invalidOffset";
    default:
      return "error.saveFailed";
  }
};

export default function AdjustmentsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<Account[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [offsetAccountId, setOffsetAccountId] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"increase" | "decrease">("increase");
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "active"),
    [accounts]
  );

  const postingAccounts = useMemo(
    () => coaAccounts.filter((account) => account.isPosting && account.status === "active"),
    [coaAccounts]
  );

  const accountNameMap = useMemo(
    () => new Map(accounts.map((account) => [account.accountId, account.name])),
    [accounts]
  );

  const offsetMap = useMemo(
    () => new Map(coaAccounts.map((account) => [account.id, account])),
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
      fetch(`/api/adjustments?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([accountData, coaData, adjustmentData]) => {
        setAccounts(accountData.accounts ?? []);
        setCoaAccounts(coaData.accounts ?? []);
        setAdjustments(adjustmentData.adjustments ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingData(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!adjustmentDate) {
      setAdjustmentDate(new Date().toISOString().slice(0, 10));
    }
  }, [adjustmentDate]);

  useEffect(() => {
    if (!activeAccounts.length || accountId) {
      return;
    }
    setAccountId(activeAccounts[0]?.accountId ?? "");
  }, [activeAccounts, accountId]);

  useEffect(() => {
    if (!postingAccounts.length || offsetAccountId) {
      return;
    }
    setOffsetAccountId(postingAccounts[0]?.id ?? "");
  }, [postingAccounts, offsetAccountId]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorKey("adjustment.invalidAmount");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          adjustmentDate,
          accountId,
          offsetAccountId,
          type,
          amount: numericAmount,
          reason: reason || null,
          memo: memo || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapAdjustmentError(data?.error));
        return;
      }
      setAmount("");
      setReason("");
      setMemo("");
      loadData();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("adjustment.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("adjustment.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("adjustment.account")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              required
            >
              <option value="">{t("common.none")}</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("adjustment.type")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value as "increase" | "decrease")}
            >
              <option value="increase">{t("adjustment.type.increase")}</option>
              <option value="decrease">{t("adjustment.type.decrease")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("adjustment.date")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={adjustmentDate}
              onChange={(event) => setAdjustmentDate(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("adjustment.amount")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("adjustment.offsetAccount")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={offsetAccountId}
              onChange={(event) => setOffsetAccountId(event.target.value)}
              required
            >
              <option value="">{t("common.none")}</option>
              {postingAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("adjustment.reason")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass} md:col-span-2`}>
            <span className="mb-1 block text-xs text-muted">{t("common.memo")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>
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
          {t("adjustment.create")}
        </button>
      </form>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("adjustment.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingData ? "—" : adjustments.length}
          </span>
        </div>
        {loadingData ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : adjustments.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("adjustment.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("adjustment.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("adjustment.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("adjustment.account")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("adjustment.type")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("adjustment.amount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("adjustment.offsetAccount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {adjustments.map((entry) => {
                  const offset = offsetMap.get(entry.offsetAccountId);
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2 font-semibold">{entry.adjustmentNumber}</td>
                      <td className="px-4 py-2">{entry.adjustmentDate}</td>
                      <td className="px-4 py-2">
                        {accountNameMap.get(entry.accountId) ?? "-"}
                      </td>
                      <td className="px-4 py-2">
                        {entry.type === "increase"
                          ? t("adjustment.type.increase")
                          : t("adjustment.type.decrease")}
                      </td>
                      <td className="px-4 py-2">{entry.amount.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        {offset ? `${offset.code} - ${offset.name}` : "-"}
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
