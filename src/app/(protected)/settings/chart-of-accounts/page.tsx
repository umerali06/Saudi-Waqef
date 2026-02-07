"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { SAUDI_COA_TEMPLATE } from "@/lib/data/coa-saudi-template";
import { useToast } from "@/components/toast";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId?: string | null;
  isPosting: boolean;
  status: "active" | "inactive";
  system?: boolean;
};

type AccountForm = {
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  isPosting: boolean;
  status: "active" | "inactive";
};

const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense", "cogs"];

export default function ChartOfAccountsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("asset");
  const [parentId, setParentId] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(true);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AccountForm | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadAccounts = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    fetch(`/api/coa?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const mapCoaErrorKey = (message?: string) => {
    switch (message) {
      case "Account code already exists":
        return "coa.codeExists";
      case "Parent must be a header account":
        return "coa.invalidParent";
      case "Accounts with children cannot be posting accounts":
        return "coa.invalidPosting";
      case "Header accounts with children cannot be deactivated":
        return "coa.invalidDeactivate";
      case "System accounts cannot be modified":
        return "coa.systemLocked";
      case "Invalid parent account":
        return "coa.invalidParent";
      case "Invalid payload":
        return "coa.invalidPayload";
      case "Duplicate account codes in template":
        return "coa.templateDuplicate";
      case "Template has unknown parent codes":
        return "coa.templateParentMissing";
      default:
        return "error.saveFailed";
    }
  };

  const handleImportTemplate = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!templateFile) {
      setErrorKey("coa.templateRequired");
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      try {
        const templateText = await templateFile.text();
        const parsed = JSON.parse(templateText);
        const template = Array.isArray(parsed) ? parsed : parsed?.template;
        if (!Array.isArray(template)) {
          setErrorKey("coa.invalidTemplate");
          return;
        }
        const response = await fetch("/api/coa/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: activeCompanyId, template }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setErrorKey(mapCoaErrorKey(data?.error));
          return;
        }
      } catch {
        setErrorKey("coa.invalidTemplate");
        return;
      }
      loadAccounts();
      toast(t("common.saved"), "success");
    });
  };

  const handleLoadSaudiTemplate = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch("/api/coa/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          template: SAUDI_COA_TEMPLATE,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCoaErrorKey(data?.error));
        return;
      }
      loadAccounts();
      toast(t("common.saved"), "success");
    });
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch("/api/coa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          code,
          name,
          type,
          parentId: parentId || null,
          isPosting,
          status: "active",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCoaErrorKey(data?.error));
        return;
      }
      setCode("");
      setName("");
      setParentId(null);
      setIsPosting(true);
      loadAccounts();
      toast(t("common.saved"), "success");
    });
  };

  const handleToggleStatus = (accountId: string, status: "active" | "inactive") => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/coa/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          status,
        }),
      });
      loadAccounts();
      toast(t("common.saved"), "success");
    });
  };

  const startEdit = (account: Account) => {
    setEditAccountId(account.id);
    setEditForm({
      code: account.code,
      name: account.name,
      type: account.type,
      parentId: account.parentId ?? null,
      isPosting: account.isPosting,
      status: account.status,
    });
  };

  const cancelEdit = () => {
    setEditAccountId(null);
    setEditForm(null);
  };

  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !editAccountId || !editForm) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/coa/${editAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          ...editForm,
          parentId: editForm.parentId || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCoaErrorKey(data?.error));
        return;
      }
      cancelEdit();
      loadAccounts();
      toast(t("common.saved"), "success");
    });
  };

  const parentOptions = useMemo(
    () => accounts.filter((acc) => !acc.isPosting),
    [accounts]
  );
  const editParentOptions = useMemo(
    () => accounts.filter((acc) => !acc.isPosting && acc.id !== editAccountId),
    [accounts, editAccountId]
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("coa.title")}</h1>
          <p className="text-sm text-muted">{t("coa.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLoadSaudiTemplate}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("coa.loadTemplate")}
          </button>
          <label className="text-xs text-muted">
            <input
              type="file"
              accept="application/json"
              className="block w-full text-xs"
              onChange={(event) => setTemplateFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={handleImportTemplate}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("coa.importTemplate")}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">{t("coa.templateHint")}</p>

      <form onSubmit={handleCreate} className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("coa.addAccount")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("coa.code")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="1001"
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("coa.name")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("coa.type")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {ACCOUNT_TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {t(`account.type.${entry}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("coa.parent")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={parentId ?? ""}
              onChange={(event) => setParentId(event.target.value || null)}
            >
              <option value="">{t("coa.none")}</option>
              {parentOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={isPosting}
            onChange={(event) => setIsPosting(event.target.checked)}
          />
          {t("coa.posting")}
        </label>
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("coa.save")}
        </button>
      </form>

      {editAccountId && editForm ? (
        <form onSubmit={handleEditSubmit} className="app-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("coa.editAccount")}</h2>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs font-semibold text-muted"
            >
              {t("common.cancel")}
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("coa.code")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={editForm.code}
                onChange={(event) =>
                  setEditForm((prev) =>
                    prev ? { ...prev, code: event.target.value } : prev
                  )
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("coa.name")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((prev) =>
                    prev ? { ...prev, name: event.target.value } : prev
                  )
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("coa.type")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={editForm.type}
                onChange={(event) =>
                  setEditForm((prev) =>
                    prev ? { ...prev, type: event.target.value } : prev
                  )
                }
              >
                {ACCOUNT_TYPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {t(`account.type.${entry}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("coa.parent")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={editForm.parentId ?? ""}
                onChange={(event) =>
                  setEditForm((prev) =>
                    prev
                      ? { ...prev, parentId: event.target.value || null }
                      : prev
                  )
                }
              >
                <option value="">{t("coa.none")}</option>
                {editParentOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={editForm.isPosting}
                onChange={(event) =>
                  setEditForm((prev) =>
                    prev ? { ...prev, isPosting: event.target.checked } : prev
                  )
                }
              />
              {t("coa.posting")}
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">{t("coa.status")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={editForm.status}
                onChange={(event) =>
                  setEditForm((prev) =>
                    prev
                      ? { ...prev, status: event.target.value as "active" | "inactive" }
                      : prev
                  )
                }
              >
                <option value="active">{t("coa.active")}</option>
                <option value="inactive">{t("coa.inactive")}</option>
              </select>
            </label>
          </div>
          {errorKey ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {t(errorKey)}
            </div>
          ) : null}
          <button
            type="submit"
            className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("common.save")}
          </button>
        </form>
      ) : null}

      <div className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("coa.list")}
        </div>
        {isLoading ? (
          <div className="space-y-4 p-4">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("coa.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("coa.code")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("coa.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("coa.type")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("coa.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("coa.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-2">{account.code}</td>
                    <td className="px-4 py-2">{account.name}</td>
                    <td className="px-4 py-2">{t(`account.type.${account.type}`)}</td>
                    <td className="px-4 py-2">
                      {account.status === "active"
                        ? t("coa.active")
                        : t("coa.inactive")}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        {!account.system ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-foreground underline decoration-dotted"
                            onClick={() => startEdit(account)}
                          >
                            {t("coa.edit")}
                          </button>
                        ) : (
                          <span className="text-xs text-muted">{t("coa.system")}</span>
                        )}
                        {!account.system ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-primary"
                            onClick={() =>
                              handleToggleStatus(
                                account.id,
                                account.status === "active" ? "inactive" : "active"
                              )
                            }
                          >
                            {account.status === "active"
                              ? t("coa.deactivate")
                              : t("coa.activate")}
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
