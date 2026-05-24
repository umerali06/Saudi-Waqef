"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { parseCsv } from "@/lib/utils/csv";
import { normalizeSearch } from "@/lib/utils/search";

type CashBankAccount = {
  id: string;
  accountId: string;
  name: string;
  type: "cash" | "bank";
  status: "active" | "inactive";
};

type StatementLine = {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: "unmatched" | "matched" | "ignored";
  matchedCashTransactionId?: string | null;
};

type ImportError = {
  row: number;
  field?: string;
  message: string;
};

const normalizeHeader = (value: string) =>
  normalizeSearch(value).replace(/[\s_\-.()]/g, "");

const headerAliases: Record<string, string> = {
  date: "date",
  transactiondate: "date",
  datevalue: "date",
  "التاريخ": "date",
  description: "description",
  details: "description",
  narration: "description",
  "الوصف": "description",
  amount: "amount",
  value: "amount",
  "المبلغ": "amount",
};

const parseDate = (value: string) => {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/");
    return `${year}-${month}-${day}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("-");
    return `${year}-${month}-${day}`;
  }
  return null;
};

const parseAmount = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/,/g, "");
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    const inner = normalized.slice(1, -1);
    const parsed = Number(inner);
    return Number.isNaN(parsed) ? null : -Math.abs(parsed);
  }
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

export default function ReconciliationPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accountOptions = useMemo(
    () => accounts.filter((account) => account.status === "active"),
    [accounts]
  );

  const formatAmount = (value: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

  const loadAccounts = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingAccounts(true);
    fetch(`/api/cash-bank-accounts?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [activeCompanyId]);

  const loadLines = useCallback(() => {
    if (!activeCompanyId || !accountId) {
      setLines([]);
      return;
    }
    setLoadingLines(true);
    fetch(`/api/reconciliation/lines?companyId=${activeCompanyId}&accountId=${accountId}`)
      .then((res) => res.json())
      .then((data) => setLines(data.lines ?? []))
      .catch(() => setLines([]))
      .finally(() => setLoadingLines(false));
  }, [activeCompanyId, accountId]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!accountOptions.length || accountId) {
      return;
    }
    setAccountId(accountOptions[0]?.accountId ?? "");
  }, [accountOptions, accountId]);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  const parseStatementFile = async (file: File) => {
    const csv = await file.text();
    const { headers, rows } = parseCsv(csv);
    if (headers.length === 0) {
      return { lines: [], errors: [{ row: 1, message: t("reconciliation.missingHeaders") }] };
    }

    const headerIndex: Record<string, number> = {};
    headers.forEach((header, index) => {
      const alias = headerAliases[normalizeHeader(header)];
      if (alias) {
        headerIndex[alias] = index;
      }
    });

    if (headerIndex.date === undefined || headerIndex.description === undefined || headerIndex.amount === undefined) {
      return {
        lines: [],
        errors: [{ row: 1, message: t("reconciliation.missingColumns") }],
      };
    }

    const errors: ImportError[] = [];
    const parsedLines: Array<{ date: string; description: string; amount: number }> = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const dateValue = parseDate(row[headerIndex.date] ?? "");
      const description = (row[headerIndex.description] ?? "").trim();
      const amountValue = parseAmount(row[headerIndex.amount] ?? "");

      if (!dateValue) {
        errors.push({ row: rowNumber, field: "date", message: t("reconciliation.invalidDate") });
        return;
      }
      if (!description) {
        errors.push({ row: rowNumber, field: "description", message: t("reconciliation.invalidDescription") });
        return;
      }
      if (amountValue === null) {
        errors.push({ row: rowNumber, field: "amount", message: t("reconciliation.invalidAmount") });
        return;
      }

      parsedLines.push({
        date: dateValue,
        description,
        amount: amountValue,
      });
    });

    return { lines: parsedLines, errors };
  };

  const handleImport = () => {
    if (!activeCompanyId || !accountId || !importFile) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      setImportErrors([]);
      const { lines: parsedLines, errors } = await parseStatementFile(importFile);
      if (!parsedLines.length) {
        setImportErrors(errors);
        setErrorKey("reconciliation.importFailed");
        return;
      }
      const response = await fetch("/api/reconciliation/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          accountId,
          lines: parsedLines,
        }),
      });
      if (!response.ok) {
        setErrorKey("reconciliation.importFailed");
        return;
      }
      setImportFile(null);
      setImportErrors(errors);
      setNoticeKey("reconciliation.imported");
      loadLines();
    });
  };

  const handleDownloadTemplate = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/reconciliation/import?companyId=${activeCompanyId}&lang=${locale}`
      );
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        locale === "ar" ? "statement-template-ar.csv" : "statement-template-en.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleAutoMatch = () => {
    if (!activeCompanyId || !accountId) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch("/api/reconciliation/auto-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, accountId }),
      });
      if (!response.ok) {
        setErrorKey("reconciliation.autoMatchFailed");
        return;
      }
      setNoticeKey("reconciliation.autoMatchDone");
      loadLines();
    });
  };

  const updateLine = (lineId: string, payload: Partial<StatementLine>) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/reconciliation/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      loadLines();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("reconciliation.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("reconciliation.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("reconciliation.account")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={loadingAccounts}
            >
              <option value="">{t("common.none")}</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-xs font-semibold"
            disabled={isPending}
          >
            {t("reconciliation.downloadTemplate")}
          </button>
          <label className="text-xs text-muted">
            <input
              type="file"
              accept="text/csv"
              className="block w-full text-xs"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={handleImport}
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-xs font-semibold"
            disabled={isPending || !importFile || !accountId}
          >
            {t("reconciliation.import")}
          </button>
          <button
            type="button"
            onClick={handleAutoMatch}
            className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast"
            disabled={isPending || !accountId}
          >
            {t("reconciliation.autoMatch")}
          </button>
        </div>
        {noticeKey ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t(noticeKey)}
          </div>
        ) : null}
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        {importErrors.length > 0 ? (
          <div className="mt-4 text-xs text-muted">
            <p className="font-semibold">{t("reconciliation.importErrors")}</p>
            <ul className="mt-2 space-y-1">
              {importErrors.map((error) => (
                <li key={`${error.row}-${error.field}-${error.message}`}>
                  #{error.row} {error.field ? `(${error.field})` : ""} - {error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("reconciliation.linesTitle")}</span>
          <span className="text-xs text-muted">
            {loadingLines ? "—" : lines.length}
          </span>
        </div>
        {loadingLines ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : lines.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("reconciliation.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reconciliation.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reconciliation.description")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reconciliation.amount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("reconciliation.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-2">{formatDate(line.date)}</td>
                    <td className="px-4 py-2">{line.description}</td>
                    <td className="px-4 py-2">{formatAmount(line.amount)}</td>
                    <td className="px-4 py-2">
                      {t(`reconciliation.status.${line.status ?? "unmatched"}`)}
                      {line.matchedCashTransactionId ? (
                        <span className="ml-2 text-xs text-muted">
                          {line.matchedCashTransactionId}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {line.status === "unmatched" ? (
                          <button
                            type="button"
                            className="font-semibold text-muted"
                            onClick={() => updateLine(line.id, { status: "ignored" })}
                          >
                            {t("reconciliation.ignore")}
                          </button>
                        ) : null}
                        {line.status === "ignored" ? (
                          <button
                            type="button"
                            className="font-semibold text-primary"
                            onClick={() => updateLine(line.id, { status: "unmatched" })}
                          >
                            {t("reconciliation.restore")}
                          </button>
                        ) : null}
                        {line.status === "matched" ? (
                          <button
                            type="button"
                            className="font-semibold text-primary"
                            onClick={() =>
                              updateLine(line.id, {
                                status: "unmatched",
                                matchedCashTransactionId: null,
                              })
                            }
                          >
                            {t("reconciliation.unmatch")}
                          </button>
                        ) : null}
                      </div>
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
