"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { SkeletonBlock } from "@/components/skeleton";
// import { toast } from "@/components/toast";
import { useToast } from "@/components/toast";

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

type JournalLineForm = {
  accountId: string;
  debit: string;
  credit: string;
};

type JournalEntry = {
  id: string;
  date: string;
  memo?: string;
  status: "draft" | "posted" | "void";
  sourceType: string;
  isAdjusting?: boolean;
  totalDebit: number;
  totalCredit: number;
  lines: { accountId: string; debit: number; credit: number }[];
};

const emptyLine = (): JournalLineForm => ({ accountId: "", debit: "", credit: "" });

export default function JournalEntriesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [lines, setLines] = useState<JournalLineForm[]>([emptyLine(), emptyLine()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isEntriesLoading, setIsEntriesLoading] = useState(true);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const postingAccounts = useMemo(
    () => accounts.filter((account) => account.isPosting && account.status === "active"),
    [accounts]
  );

  const formatAmount = (value: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        acc.debit += debit;
        acc.credit += credit;
        return acc;
      },
      { debit: 0, credit: 0 }
    );
  }, [lines]);

  const difference = totals.debit - totals.credit;

  const resetForm = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setIsAdjusting(false);
    setLines([emptyLine(), emptyLine()]);
    setEditingId(null);
  };

  const loadAccounts = useCallback(() => {
    if (!activeCompanyId) return;
    setIsAccountsLoading(true);
    fetch(`/api/coa?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsAccountsLoading(false));
  }, [activeCompanyId]);

  const loadEntries = useCallback(() => {
    if (!activeCompanyId) {
      setIsEntriesLoading(false);
      return;
    }
    setIsEntriesLoading(true);
    setErrorKey(null);

    const params = new URLSearchParams({
      companyId: activeCompanyId,
      status: statusFilter,
    });
    if (startDate) {
      params.set("startDate", startDate);
    }
    if (endDate) {
      params.set("endDate", endDate);
    }
    fetch(`/api/journal-entries?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setEntries(data.entries ?? []))
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsEntriesLoading(false));
  }, [activeCompanyId, endDate, startDate, statusFilter]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const updateLine = (index: number, field: keyof JournalLineForm, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) {
          return line;
        }
        const updated = { ...line, [field]: value };
        if (field === "debit" && value) {
          updated.credit = "";
        } else if (field === "credit" && value) {
          updated.debit = "";
        }
        return updated;
      })
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const buildPayload = (status: "draft" | "posted") => {
    const validLines = lines
      .map((line) => ({
        accountId: line.accountId,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
      }))
      .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));

    return {
      companyId: activeCompanyId,
      date: entryDate,
      memo: memo || null,
      isAdjusting,
      status,
      lines: validLines,
    };
  };

  const mapError = (message?: string) => {
    switch (message) {
      case "Unbalanced entry":
        return "journal.errors.unbalanced";
      case "Invalid line amount":
        return "journal.errors.invalidLine";
      case "Invalid account":
        return "journal.errors.invalidAccount";
      case "Accounting period is closed":
        return "journal.errors.closedPeriod";
      case "Posting period is locked":
        return "journal.errors.lockedPeriod";
      case "Entry is not editable":
        return "journal.errors.notEditable";
      case "Posted entries cannot be voided":
        return "journal.errors.voidNotAllowed";
      default:
        return "error.saveFailed";
    }
  };

  const handleSubmit = (status: "draft" | "posted") => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);

    const payload = buildPayload(status);
    if (payload.lines.length < 2) {
      setErrorKey("journal.errors.unbalanced");
      return;
    }

    startTransition(async () => {
      const response = await fetch(
        editingId ? `/api/journal-entries/${editingId}` : "/api/journal-entries",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapError(data?.error));
        return;
      }
      resetForm();
      loadEntries();
      toast(t("common.saved"), "success");
    });
  };

  const handleEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setEntryDate(entry.date);
    setMemo(entry.memo ?? "");
    setIsAdjusting(Boolean(entry.isAdjusting));
    setLines(
      entry.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit ? String(line.debit) : "",
        credit: line.credit ? String(line.credit) : "",
      }))
    );
  };

  const handlePost = (entryId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(`/api/journal-entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, status: "posted" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapError(data?.error));
        return;
      }
      loadEntries();
      toast(t("common.saved"), "success");
    });
  };

  const handleReverse = (entryId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/journal-entries/${entryId}/reverse?companyId=${activeCompanyId}`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapError(data?.error));
        return;
      }
      loadEntries();
      toast(t("common.saved"), "success");
    });
  };

  const handleDelete = (entryId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/journal-entries/${entryId}?companyId=${activeCompanyId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      loadEntries();
      toast(t("common.saved"), "success");
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("journal.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("journal.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        {isEntriesLoading && entries.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <SkeletonBlock className="mb-1 h-4 w-16" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
            <div>
              <SkeletonBlock className="mb-1 h-4 w-16" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
            <div>
              <SkeletonBlock className="mb-1 h-4 w-16" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
            <div className="flex items-end">
              <SkeletonBlock className="h-10 w-20" />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-sm">
              <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
                {t("journal.filters.status")}
              </span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">{t("common.all")}</option>
                <option value="draft">{t("journal.status.draft")}</option>
                <option value="posted">{t("journal.status.posted")}</option>
                <option value="void">{t("journal.status.void")}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
                {t("journal.filters.startDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
                {t("journal.filters.endDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                onClick={loadEntries}
              >
                {t("common.apply")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="app-card p-6 card-modern">
        {isAccountsLoading ? (
          <div className="space-y-4">
            <div className="flex justify-between">
              <SkeletonBlock className="h-6 w-32" />
              <SkeletonBlock className="h-5 w-24" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
            <SkeletonBlock className="h-40 w-full" />
            <div className="flex gap-4">
              <SkeletonBlock className="h-8 w-24" />
              <SkeletonBlock className="h-8 w-24" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {editingId ? t("journal.editTitle") : t("journal.addTitle")}
              </h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isAdjusting}
                  onChange={(event) => setIsAdjusting(event.target.checked)}
                />
                {t("journal.adjusting")}
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("journal.date")}</span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={entryDate}
                  onChange={(event) => setEntryDate(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("journal.memo")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder={t("journal.memoPlaceholder")}
                />
              </label>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("journal.account")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("journal.debit")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("journal.credit")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("journal.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, index) => (
                    <tr key={`${index}-${line.accountId}`}>
                      <td className="px-4 py-2">
                        <select
                          className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                          value={line.accountId}
                          onChange={(event) => updateLine(index, "accountId", event.target.value)}
                        >
                          <option value="">{t("journal.accountPlaceholder")}</option>
                          {postingAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                          value={line.debit}
                          onChange={(event) => updateLine(index, "debit", event.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                          value={line.credit}
                          onChange={(event) => updateLine(index, "credit", event.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary"
                          onClick={() => removeLine(index)}
                          disabled={lines.length <= 2}
                        >
                          {t("journal.removeLine")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <button
                type="button"
                className="rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
                onClick={addLine}
              >
                {t("journal.addLine")}
              </button>
              <div className="text-xs text-muted">
                {t("journal.totalDebit")}: {formatAmount(totals.debit)}
              </div>
              <div className="text-xs text-muted">
                {t("journal.totalCredit")}: {formatAmount(totals.credit)}
              </div>
              <div className={`text-xs ${difference === 0 ? "text-muted" : "text-red-500"}`}>
                {t("journal.difference")}: {formatAmount(difference)}
              </div>
            </div>
            {errorKey ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {t(errorKey)}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                onClick={() => handleSubmit("draft")}
                disabled={isPending || isAccountsLoading}
              >
                {editingId ? t("journal.updateDraft") : t("journal.saveDraft")}
              </button>
              <button
                type="button"
                className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                onClick={() => handleSubmit("posted")}
                disabled={isPending || isAccountsLoading}
              >
                {editingId ? t("journal.postNow") : t("journal.post")}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                  onClick={resetForm}
                  disabled={isPending}
                >
                  {t("common.cancel")}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("journal.listTitle")}</span>
          <span className="text-xs text-muted">{entries.length}</span>
        </div>
        {isEntriesLoading ? (
          <div className="p-4 space-y-2">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("journal.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("journal.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("journal.memo")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("journal.status.label")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("journal.debit")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("journal.credit")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("journal.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2">{entry.date}</td>
                    <td className="px-4 py-2">{entry.memo || "-"}</td>
                    <td className="px-4 py-2">
                      {entry.status === "draft"
                        ? t("journal.status.draft")
                        : entry.status === "posted"
                        ? t("journal.status.posted")
                        : t("journal.status.void")}
                    </td>
                    <td className="px-4 py-2">{formatAmount(entry.totalDebit)}</td>
                    <td className="px-4 py-2">{formatAmount(entry.totalCredit)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {entry.sourceType === "manual" && entry.status === "draft" ? (
                          <>
                            <button
                              type="button"
                              className="font-semibold text-primary"
                              onClick={() => handleEdit(entry)}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              className="font-semibold text-primary"
                              onClick={() => handlePost(entry.id)}
                            >
                              {t("journal.post")}
                            </button>
                            <button
                              type="button"
                              className="font-semibold text-muted"
                              onClick={() => handleDelete(entry.id)}
                            >
                              {t("common.delete")}
                            </button>
                          </>
                        ) : null}
                        {entry.sourceType === "manual" && entry.status === "posted" ? (
                          <button
                            type="button"
                            className="font-semibold text-primary"
                            onClick={() => handleReverse(entry.id)}
                          >
                            {t("journal.reverse")}
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
