"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useTranslations } from "@/i18n/provider";
import { useToast } from "@/components/toast";
import { SkeletonBlock } from "@/components/skeleton";

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

type CompanyDefaults = {
  salesAccountId: string | null;
  purchasesAccountId: string | null;
  vatOutputAccountId: string | null;
  vatInputAccountId: string | null;
  discountAccountId: string | null;
  receivableAccountId: string | null;
  payableAccountId: string | null;
  defaultSalesTaxCategoryId: string | null;
  defaultPurchaseTaxCategoryId: string | null;
  defaultSalesPaymentTermId: string | null;
  defaultPurchasePaymentTermId: string | null;
};

type TaxCategory = {
  id: string;
  name: string;
  rate: number;
  type: "standard" | "zero" | "exempt";
  status: "active" | "inactive";
};

type PaymentTerm = {
  id: string;
  name: string;
  days: number;
  status: "active" | "inactive";
};

const EMPTY_DEFAULTS: CompanyDefaults = {
  salesAccountId: null,
  purchasesAccountId: null,
  vatOutputAccountId: null,
  vatInputAccountId: null,
  discountAccountId: null,
  receivableAccountId: null,
  payableAccountId: null,
  defaultSalesTaxCategoryId: null,
  defaultPurchaseTaxCategoryId: null,
  defaultSalesPaymentTermId: null,
  defaultPurchasePaymentTermId: null,
};

export default function AccountingDefaultsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { setDirty, markClean } = useUnsavedChanges();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults>(EMPTY_DEFAULTS);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [newTax, setNewTax] = useState({ name: "", rate: 15, type: "standard" });
  const [newTerm, setNewTerm] = useState({ name: "", days: 30 });
  const [editTaxId, setEditTaxId] = useState<string | null>(null);
  const [editTax, setEditTax] = useState<TaxCategory | null>(null);
  const [editTermId, setEditTermId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState<PaymentTerm | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        defaults,
        newTax,
        newTerm,
        editTaxId,
        editTax,
        editTermId,
        editTerm,
      }),
    [defaults, newTax, newTerm, editTaxId, editTax, editTermId, editTerm]
  );

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    markClean();
    Promise.all([
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/company-defaults?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/tax-categories?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/payment-terms?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
    ])
      .then(([coaData, defaultsData, taxData, termData]) => {
        const nextDefaults = { ...EMPTY_DEFAULTS, ...(defaultsData.defaults ?? {}) };
        const nextTaxCategories = taxData.categories ?? [];
        const nextPaymentTerms = termData.terms ?? [];
        setAccounts(coaData.accounts ?? []);
        setDefaults(nextDefaults);
        setTaxCategories(nextTaxCategories);
        setPaymentTerms(nextPaymentTerms);
        setEditTaxId(null);
        setEditTax(null);
        setEditTermId(null);
        setEditTerm(null);
        setNewTax({ name: "", rate: 15, type: "standard" });
        setNewTerm({ name: "", days: 30 });
        setInitialSnapshot(
          JSON.stringify({
            defaults: nextDefaults,
            newTax: { name: "", rate: 15, type: "standard" },
            newTerm: { name: "", days: 30 },
            editTaxId: null,
            editTax: null,
            editTermId: null,
            editTerm: null,
          })
        );
        markClean();
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId, markClean]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!initialSnapshot) {
      return;
    }
    setDirty(snapshot !== initialSnapshot);
  }, [snapshot, initialSnapshot, setDirty]);

  const postingAccounts = useMemo(
    () => accounts.filter((account) => account.isPosting && account.status === "active"),
    [accounts]
  );

  const activeTaxCategories = useMemo(
    () => taxCategories.filter((category) => category.status === "active"),
    [taxCategories]
  );

  const activePaymentTerms = useMemo(
    () => paymentTerms.filter((term) => term.status === "active"),
    [paymentTerms]
  );

  const mapDefaultsError = (message?: string) => {
    switch (message) {
      case "Invalid default account":
        return "defaults.invalidAccount";
      case "Invalid default tax category":
        return "defaults.invalidTax";
      case "Invalid default payment term":
        return "defaults.invalidTerm";
      default:
        return "error.saveFailed";
    }
  };

  const handleDefaultsSave = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/company-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          ...defaults,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapDefaultsError(data?.error));
      } else {
        toast(t("common.saved"), "success");
      }
    });
  };

  const handleCreateTax = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/tax-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name: newTax.name,
          rate: Number(newTax.rate),
          type: newTax.type,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setNewTax({ name: "", rate: 15, type: "standard" });
      loadData();
      toast(t("common.saved"), "success");
    });
  };

  const handleUpdateTax = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !editTaxId || !editTax) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/tax-categories/${editTaxId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name: editTax.name,
          rate: Number(editTax.rate),
          type: editTax.type,
          status: editTax.status,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setEditTaxId(null);
      setEditTax(null);
      loadData();
      toast(t("common.saved"), "success");
    });
  };

  const handleToggleTaxStatus = (category: TaxCategory) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/tax-categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          status: category.status === "active" ? "inactive" : "active",
        }),
      });
      loadData();
    });
  };

  const handleCreateTerm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/payment-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name: newTerm.name,
          days: Number(newTerm.days),
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setNewTerm({ name: "", days: 30 });
      loadData();
      toast(t("common.saved"), "success");
    });
  };

  const handleUpdateTerm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !editTermId || !editTerm) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/payment-terms/${editTermId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name: editTerm.name,
          days: Number(editTerm.days),
          status: editTerm.status,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setEditTermId(null);
      setEditTerm(null);
      loadData();
      toast(t("common.saved"), "success");
    });
  };

  const handleToggleTermStatus = (term: PaymentTerm) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/payment-terms/${term.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          status: term.status === "active" ? "inactive" : "active",
        }),
      });
      loadData();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("defaults.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("defaults.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("defaults.accountsTitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.salesAccount")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.salesAccountId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    salesAccountId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.purchasesAccount")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.purchasesAccountId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    purchasesAccountId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.receivableAccount")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.receivableAccountId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    receivableAccountId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.payableAccount")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.payableAccountId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    payableAccountId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.vatOutputAccount")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.vatOutputAccountId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    vatOutputAccountId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.vatInputAccount")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.vatInputAccountId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    vatInputAccountId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.discountAccount")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.discountAccountId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    discountAccountId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {postingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        <h3 className="mt-6 text-sm font-semibold">{t("defaults.taxTitle")}</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.salesTax")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.defaultSalesTaxCategoryId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    defaultSalesTaxCategoryId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {activeTaxCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.rate}%)
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.purchaseTax")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.defaultPurchaseTaxCategoryId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    defaultPurchaseTaxCategoryId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {activeTaxCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.rate}%)
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        <h3 className="mt-6 text-sm font-semibold">{t("defaults.paymentTitle")}</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.salesPayment")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.defaultSalesPaymentTermId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    defaultSalesPaymentTermId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {activePaymentTerms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} ({term.days} {t("defaults.days")})
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("defaults.purchasePayment")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={defaults.defaultPurchasePaymentTermId ?? ""}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    defaultPurchasePaymentTermId: event.target.value || null,
                  }))
                }
              >
                <option value="">{t("defaults.none")}</option>
                {activePaymentTerms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} ({term.days} {t("defaults.days")})
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="button"
          className="mt-4 w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          onClick={handleDefaultsSave}
          disabled={isPending || isLoading}
        >
          {t("common.save")}
        </button>
      </div>

      <form onSubmit={handleCreateTax} className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("tax.title")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("tax.name")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={newTax.name}
              onChange={(event) =>
                setNewTax((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("tax.rate")}</span>
            <input
              type="number"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={newTax.rate}
              onChange={(event) =>
                setNewTax((prev) => ({ ...prev, rate: Number(event.target.value) }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("tax.type")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={newTax.type}
              onChange={(event) =>
                setNewTax((prev) => ({ ...prev, type: event.target.value }))
              }
            >
              <option value="standard">{t("tax.type.standard")}</option>
              <option value="zero">{t("tax.type.zero")}</option>
              <option value="exempt">{t("tax.type.exempt")}</option>
            </select>
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="mt-4 w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending || isLoading}
        >
          {t("tax.add")}
        </button>
      </form>

      {editTaxId && editTax ? (
        <form onSubmit={handleUpdateTax} className="app-card p-6 card-modern">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("tax.edit")}</h2>
            <button
              type="button"
              className="text-xs font-semibold text-muted"
              onClick={() => {
                setEditTaxId(null);
                setEditTax(null);
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("tax.name")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={editTax.name}
                onChange={(event) =>
                  setEditTax((prev) =>
                    prev ? { ...prev, name: event.target.value } : prev
                  )
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("tax.rate")}</span>
              <input
                type="number"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={editTax.rate}
                onChange={(event) =>
                  setEditTax((prev) =>
                    prev ? { ...prev, rate: Number(event.target.value) } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("tax.type")}</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={editTax.type}
                onChange={(event) =>
                  setEditTax((prev) =>
                    prev ? { ...prev, type: event.target.value as TaxCategory["type"] } : prev
                  )
                }
              >
                <option value="standard">{t("tax.type.standard")}</option>
                <option value="zero">{t("tax.type.zero")}</option>
                <option value="exempt">{t("tax.type.exempt")}</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="mt-4 w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("common.save")}
          </button>
        </form>
      ) : null}

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("tax.listTitle")}
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : taxCategories.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("tax.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("tax.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("tax.rate")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("tax.type")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("tax.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("tax.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {taxCategories.map((category) => (
                  <tr key={category.id}>
                    <td className="px-4 py-2">{category.name}</td>
                    <td className="px-4 py-2">{category.rate}%</td>
                    <td className="px-4 py-2">{t(`tax.type.${category.type}`)}</td>
                    <td className="px-4 py-2">
                      {category.status === "active"
                        ? t("tax.active")
                        : t("tax.inactive")}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className="text-xs font-semibold text-foreground underline decoration-dotted"
                          onClick={() => {
                            setEditTaxId(category.id);
                            setEditTax({ ...category });
                          }}
                        >
                          {t("tax.edit")}
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary"
                          onClick={() => handleToggleTaxStatus(category)}
                        >
                          {category.status === "active"
                            ? t("tax.deactivate")
                            : t("tax.activate")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={handleCreateTerm} className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("paymentTerms.title")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("terms.name")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={newTerm.name}
              onChange={(event) =>
                setNewTerm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("terms.days")}</span>
            <input
              type="number"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={newTerm.days}
              onChange={(event) =>
                setNewTerm((prev) => ({ ...prev, days: Number(event.target.value) }))
              }
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
          className="mt-4 w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending || isLoading}
        >
          {t("terms.add")}
        </button>
      </form>

      {editTermId && editTerm ? (
        <form onSubmit={handleUpdateTerm} className="app-card p-6 card-modern">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("terms.edit")}</h2>
            <button
              type="button"
              className="text-xs font-semibold text-muted"
              onClick={() => {
                setEditTermId(null);
                setEditTerm(null);
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("terms.name")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={editTerm.name}
                onChange={(event) =>
                  setEditTerm((prev) =>
                    prev ? { ...prev, name: event.target.value } : prev
                  )
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("terms.days")}</span>
              <input
                type="number"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={editTerm.days}
                onChange={(event) =>
                  setEditTerm((prev) =>
                    prev ? { ...prev, days: Number(event.target.value) } : prev
                  )
                }
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-4 w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("common.save")}
          </button>
        </form>
      ) : null}

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("terms.listTitle")}
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : paymentTerms.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("terms.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("terms.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("terms.days")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("terms.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("terms.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paymentTerms.map((term) => (
                  <tr key={term.id}>
                    <td className="px-4 py-2">{term.name}</td>
                    <td className="px-4 py-2">{term.days}</td>
                    <td className="px-4 py-2">
                      {term.status === "active"
                        ? t("terms.active")
                        : t("terms.inactive")}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className="text-xs font-semibold text-foreground underline decoration-dotted"
                          onClick={() => {
                            setEditTermId(term.id);
                            setEditTerm({ ...term });
                          }}
                        >
                          {t("terms.edit")}
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary"
                          onClick={() => handleToggleTermStatus(term)}
                        >
                          {term.status === "active"
                            ? t("terms.deactivate")
                            : t("terms.activate")}
                        </button>
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
