"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useToast } from "@/components/toast";
import { SkeletonBlock } from "@/components/skeleton";


type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
};

type BalanceRow = {
  accountId: string;
  debit: number;
  credit: number;
};

export default function OpeningBalancesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, BalanceRow>>({});
  const [asOfDate, setAsOfDate] = useState("");
  const [periodLockDate, setPeriodLockDate] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const formatDate = useCallback(
    (value: string | null) => {
      if (!value) {
        return t("common.na");
      }
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
    },
    [locale, t]
  );

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    Promise.all([
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/opening-balances?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
    ])
      .then(([coaData, balanceData, configData]) => {
        const accountsList = (coaData.accounts ?? []).filter(
          (account: Account) => account.isPosting
        );
        setAccounts(accountsList);
        const nextBalances: Record<string, BalanceRow> = {};
        (balanceData.balances ?? []).forEach((entry: BalanceRow) => {
          nextBalances[entry.accountId] = entry;
        });
        setBalances(nextBalances);
        const inferredDate =
          balanceData.balances?.[0]?.asOfDate ??
          new Date().toISOString().slice(0, 10);
        setAsOfDate(inferredDate);
        setPeriodLockDate(configData?.config?.periodLockDate ?? null);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    return accounts.reduce(
      (acc, account) => {
        const row = balances[account.id];
        return {
          debit: acc.debit + (row?.debit ?? 0),
          credit: acc.credit + (row?.credit ?? 0),
        };
      },
      { debit: 0, credit: 0 }
    );
  }, [accounts, balances]);

  const difference = totals.debit - totals.credit;

  const handleSave = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const payloadDate = asOfDate || new Date().toISOString().slice(0, 10);
      const entries = accounts.map((account) => {
        const row = balances[account.id] ?? {
          accountId: account.id,
          debit: 0,
          credit: 0,
        };
        return {
          accountId: account.id,
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
        };
      });
      const response = await fetch("/api/opening-balances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          asOfDate: payloadDate,
          entries,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.error === "Posting period is locked") {
          setErrorKey("opening.locked");
        } else if (data?.error === "Accounting period is closed") {
          setErrorKey("opening.closed");
        } else {
          setErrorKey("opening.mustBalance");
        }
      } else {
        toast(t("common.saved"), "success");
      }
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("opening.title")}</h1>
        <p className="text-sm text-muted">{t("opening.subtitle")}</p>
      </div>

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("opening.asOfDate")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
                required
              />
            )}
          </label>
          <div className="text-sm text-muted">
            <p className="text-xs uppercase tracking-wide">{t("opening.lockDate")}</p>
            {isLoading ? (
              <SkeletonBlock className="mt-1 h-5 w-24" />
            ) : (
              <p className="mt-1 text-sm text-foreground">{formatDate(periodLockDate)}</p>
            )}
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("opening.title")}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-muted text-muted">
              <tr>
                <th className={`px-4 py-2 ${alignClass}`}>{t("coa.code")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("coa.name")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("opening.debit")}</th>
                <th className={`px-4 py-2 ${alignClass}`}>{t("opening.credit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        <SkeletonBlock className="h-5 w-24" />
                      </td>
                      <td className="px-4 py-2">
                        <SkeletonBlock className="h-5 w-48" />
                      </td>
                      <td className="px-4 py-2">
                        <SkeletonBlock className="h-9 w-full" />
                      </td>
                      <td className="px-4 py-2">
                        <SkeletonBlock className="h-9 w-full" />
                      </td>
                    </tr>
                  ))
                : accounts.map((account) => {
                    const row = balances[account.id] ?? {
                      accountId: account.id,
                      debit: 0,
                      credit: 0,
                    };
                return (
                  <tr key={account.id}>
                    <td className="px-4 py-2">{account.code}</td>
                    <td className="px-4 py-2">{account.name}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                        value={row.debit}
                        onChange={(event) =>
                          setBalances((prev) => ({
                            ...prev,
                            [account.id]: {
                              accountId: account.id,
                              debit: Number(event.target.value),
                              credit: row.credit,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                        value={row.credit}
                        onChange={(event) =>
                          setBalances((prev) => ({
                            ...prev,
                            [account.id]: {
                              accountId: account.id,
                              debit: row.debit,
                              credit: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-sm text-muted">
          <div className="flex flex-wrap gap-6">
            {isLoading ? (
              <>
                <SkeletonBlock className="h-5 w-32" />
                <SkeletonBlock className="h-5 w-32" />
                <SkeletonBlock className="h-5 w-32" />
              </>
            ) : (
              <>
                <span>
                  {t("opening.totalDebit")}: {totals.debit.toFixed(2)}
                </span>
                <span>
                  {t("opening.totalCredit")}: {totals.credit.toFixed(2)}
                </span>
                <span>
                  {t("opening.difference")}: {difference.toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {difference !== 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t("opening.mustBalance")}
        </div>
      ) : null}
      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      <button
        type="button"
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:opacity-50"
        onClick={handleSave}
        disabled={isPending || difference !== 0 || isLoading}
      >
        {t("opening.save")}
      </button>
    </section>
  );
}
