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

type Transfer = {
  id: string;
  transferNumber: string;
  transferDate: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reference?: string | null;
  memo?: string | null;
};

const mapTransferError = (error?: string) => {
  switch (error) {
    case "Invalid source account":
      return "transfer.invalidSource";
    case "Invalid destination account":
      return "transfer.invalidDestination";
    case "Accounts must differ":
      return "transfer.sameAccount";
    default:
      return "error.saveFailed";
  }
};

export default function TransfersPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "active"),
    [accounts]
  );

  const accountNameMap = useMemo(
    () => new Map(accounts.map((account) => [account.accountId, account.name])),
    [accounts]
  );

  const formatDate = (value: string) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
    }).format(date);
  };

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingData(true);
    Promise.all([
      fetch(`/api/cash-bank-accounts?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/transfers?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([accountData, transferData]) => {
        setAccounts(accountData.accounts ?? []);
        setTransfers(transferData.transfers ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingData(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!transferDate) {
      setTransferDate(new Date().toISOString().slice(0, 10));
    }
  }, [transferDate]);

  useEffect(() => {
    if (!activeAccounts.length) {
      return;
    }
    if (!fromAccountId) {
      setFromAccountId(activeAccounts[0]?.accountId ?? "");
    }
    if (!toAccountId && activeAccounts.length > 1) {
      setToAccountId(activeAccounts[1]?.accountId ?? activeAccounts[0]?.accountId ?? "");
    }
  }, [activeAccounts, fromAccountId, toAccountId]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorKey("transfer.invalidAmount");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          transferDate,
          fromAccountId,
          toAccountId,
          amount: numericAmount,
          reference: reference || null,
          memo: memo || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapTransferError(data?.error));
        return;
      }
      setAmount("");
      setReference("");
      setMemo("");
      loadData();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("transfer.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("transfer.subtitle")}</p>
        </div>
        <a
          href={`/api/payments/transfers/export?companyId=${activeCompanyId ?? ""}`}
          className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
        >
          {t("transfer.exportCsv")}
        </a>
      </div>

      <form onSubmit={handleSubmit} className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("transfer.fromAccount")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={fromAccountId}
              onChange={(event) => setFromAccountId(event.target.value)}
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
            <span className="mb-1 block text-xs text-muted">{t("transfer.toAccount")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={toAccountId}
              onChange={(event) => setToAccountId(event.target.value)}
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
            <span className="mb-1 block text-xs text-muted">{t("transfer.date")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={transferDate}
              onChange={(event) => setTransferDate(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("transfer.amount")}</span>
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
            <span className="mb-1 block text-xs text-muted">{t("common.reference")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={t("transfer.referencePlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
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
          {t("transfer.create")}
        </button>
      </form>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("transfer.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingData ? "—" : transfers.length}
          </span>
        </div>
        {loadingData ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("transfer.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("transfer.number")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("transfer.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("transfer.fromAccount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("transfer.toAccount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("transfer.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td className="px-4 py-2 font-semibold">{transfer.transferNumber}</td>
                    <td className="px-4 py-2">{formatDate(transfer.transferDate)}</td>
                    <td className="px-4 py-2">
                      {accountNameMap.get(transfer.fromAccountId) ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      {accountNameMap.get(transfer.toAccountId) ?? "-"}
                    </td>
                    <td className="px-4 py-2">{transfer.amount.toFixed(2)}</td>
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
