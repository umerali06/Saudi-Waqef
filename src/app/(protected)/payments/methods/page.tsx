"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  defaultAccountId?: string | null;
  status: "active" | "inactive";
  isSystem: boolean;
};

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

const mapMethodError = (error?: string) => {
  switch (error) {
    case "Invalid account":
      return "payments.methods.invalidAccount";
    default:
      return "error.saveFailed";
  }
};

export default function PaymentMethodsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSystem, setEditingSystem] = useState(false);
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
    () => accounts.filter((account) => account.isPosting && account.status === "active"),
    [accounts]
  );

  const formatMethodName = (method: PaymentMethod) => {
    if (method.isSystem && method.code) {
      return t(`payment.method.${method.code}`);
    }
    return method.name || method.code || t("common.unknown");
  };

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setLoadingData(true);
    Promise.all([
      fetch(`/api/payment-methods?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([methodData, coaData]) => {
        setMethods(methodData.methods ?? []);
        setAccounts(coaData.accounts ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingData(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setCode("");
    setName("");
    setDefaultAccountId("");
    setStatus("active");
    setEditingId(null);
    setEditingSystem(false);
  };

  const handleSubmit = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!editingId && !code.trim()) {
      setErrorKey("payments.methods.missingCode");
      return;
    }
    if (!name.trim()) {
      setErrorKey("payments.methods.missingName");
      return;
    }

    setErrorKey(null);
    startTransition(async () => {
      const payload = editingId
        ? {
            name: name.trim(),
            defaultAccountId: defaultAccountId || null,
            status,
          }
        : {
            companyId: activeCompanyId,
            code: code.trim(),
            name: name.trim(),
            defaultAccountId: defaultAccountId || null,
            status,
          };

      const response = await fetch(
        editingId ? `/api/payment-methods/${editingId}` : "/api/payment-methods",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapMethodError(data?.error));
        return;
      }
      resetForm();
      loadData();
    });
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingId(method.id);
    setEditingSystem(method.isSystem);
    setCode(method.code ?? "");
    setName(method.name ?? "");
    setDefaultAccountId(method.defaultAccountId ?? "");
    setStatus(method.status ?? "active");
  };

  const handleStatusToggle = (method: PaymentMethod) => {
    startTransition(async () => {
      await fetch(`/api/payment-methods/${method.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: method.status === "active" ? "inactive" : "active",
        }),
      });
      loadData();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("payments.methods.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("payments.methods.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("payments.methods.code")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={Boolean(editingId)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("payments.methods.name")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("payments.methods.defaultAccount")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={defaultAccountId}
              onChange={(event) => setDefaultAccountId(event.target.value)}
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
            <span className="mb-1 block text-xs text-muted">{t("payments.methods.status")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
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
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {editingId ? t("payments.methods.update") : t("payments.methods.create")}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
            >
              {t("common.cancel")}
            </button>
          ) : null}
          {editingId && editingSystem ? (
            <span className="self-center text-xs text-muted">
              {t("payments.methods.system")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("payments.methods.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingData ? "—" : methods.length}
          </span>
        </div>
        {loadingData ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : methods.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("payments.methods.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.methods.code")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.methods.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.methods.defaultAccount")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payments.methods.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {methods.map((method) => {
                  const account = accounts.find((entry) => entry.id === method.defaultAccountId);
                  const displayName = formatMethodName(method);
                  return (
                    <tr key={method.id}>
                      <td className="px-4 py-2 font-semibold">{method.code || "-"}</td>
                      <td className="px-4 py-2">
                        <span className="font-semibold">{displayName}</span>
                        {method.isSystem ? (
                          <span className="ml-2 text-xs text-muted">
                            {t("payments.methods.system")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        {account ? `${account.code} - ${account.name}` : "-"}
                      </td>
                      <td className="px-4 py-2">
                        {t(`status.${method.status ?? "active"}`)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleEdit(method)}
                            className="font-semibold text-primary"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(method)}
                            className="font-semibold text-muted"
                          >
                            {method.status === "active"
                              ? t("payments.methods.deactivate")
                              : t("payments.methods.activate")}
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
