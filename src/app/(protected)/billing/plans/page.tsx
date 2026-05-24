"use client";

import { useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxCompanies?: number | null;
  modules: string[];
  trialDays: number;
  graceDays: number;
  isActive: boolean;
  isDefault: boolean;
};

const MODULE_OPTIONS = [
  { key: "accounting", labelKey: "billing.module.accounting" },
  { key: "payments", labelKey: "billing.module.payments" },
  { key: "inventory", labelKey: "billing.module.inventory" },
  { key: "hr", labelKey: "billing.module.hr" },
  { key: "reports", labelKey: "billing.module.reports" },
];

const EMPTY_PLAN = {
  code: "",
  name: "",
  description: "",
  currency: "SAR",
  priceMonthly: 0,
  priceYearly: 0,
  maxUsers: 3,
  maxCompanies: "",
  modules: ["accounting", "reports"],
  trialDays: 14,
  graceDays: 7,
  isActive: true,
  isDefault: false,
};

export default function BillingPlansPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [form, setForm] = useState(EMPTY_PLAN);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = ["owner", "admin"].includes(activeCompany?.role ?? "");

  const loadPlans = () => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/billing/plans?companyId=${activeCompanyId}&includeInactive=true`)
      .then((res) => res.json())
      .then((data) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]));
  };

  useEffect(() => {
    loadPlans();
  }, [activeCompanyId]);

  const handleToggleModule = (moduleKey: string) => {
    setForm((prev) => {
      const has = prev.modules.includes(moduleKey);
      return {
        ...prev,
        modules: has
          ? prev.modules.filter((item) => item !== moduleKey)
          : [...prev.modules, moduleKey],
      };
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const payload = {
        companyId: activeCompanyId,
        code: form.code,
        name: form.name,
        description: form.description || null,
        currency: form.currency,
        priceMonthly: Number(form.priceMonthly),
        priceYearly: Number(form.priceYearly),
        maxUsers: Number(form.maxUsers),
        maxCompanies: form.maxCompanies ? Number(form.maxCompanies) : null,
        modules: form.modules,
        trialDays: Number(form.trialDays),
        graceDays: Number(form.graceDays),
        isActive: form.isActive,
        isDefault: form.isDefault,
      };

      const response = await fetch("/api/billing/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setErrorKey("billing.errors.planSaveFailed");
        return;
      }

      setForm(EMPTY_PLAN);
      loadPlans();
    });
  };

  const startEdit = (plan: BillingPlan) => {
    setEditingId(plan.id);
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? "",
      currency: plan.currency,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      maxUsers: plan.maxUsers,
      maxCompanies: plan.maxCompanies ? String(plan.maxCompanies) : "",
      modules: plan.modules ?? [],
      trialDays: plan.trialDays ?? 0,
      graceDays: plan.graceDays ?? 0,
      isActive: plan.isActive,
      isDefault: plan.isDefault,
    });
  };

  const handleUpdate = () => {
    if (!activeCompanyId || !editingId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/billing/plans/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name: form.name,
          description: form.description || null,
          currency: form.currency,
          priceMonthly: Number(form.priceMonthly),
          priceYearly: Number(form.priceYearly),
          maxUsers: Number(form.maxUsers),
          maxCompanies: form.maxCompanies ? Number(form.maxCompanies) : null,
          modules: form.modules,
          trialDays: Number(form.trialDays),
          graceDays: Number(form.graceDays),
          isActive: form.isActive,
          isDefault: form.isDefault,
        }),
      });

      if (!response.ok) {
        setErrorKey("billing.errors.planSaveFailed");
        return;
      }
      setEditingId(null);
      setForm(EMPTY_PLAN);
      loadPlans();
    });
  };

  const handleDeactivate = (planId: string) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/billing/plans/${planId}?companyId=${activeCompanyId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        setErrorKey("billing.errors.planSaveFailed");
        return;
      }
      loadPlans();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("billing.plansTitle")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("billing.plansSubtitle")}</p>
      </div>

      {!isAdmin ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {t("billing.adminOnly")}
        </div>
      ) : null}

      {isAdmin ? (
        <form onSubmit={handleSubmit} className="app-card p-6 card-modern">
          <h2 className="text-lg font-semibold">{t("billing.planFormTitle")}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.planCode")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                required
                minLength={2}
                disabled={Boolean(editingId)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.planName")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
                minLength={2}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.planDescription")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.priceMonthly")}</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.priceMonthly}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, priceMonthly: Number(event.target.value) }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.priceYearly")}</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.priceYearly}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, priceYearly: Number(event.target.value) }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.maxUsers")}</span>
              <input
                type="number"
                min={1}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.maxUsers}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, maxUsers: Number(event.target.value) }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.maxCompanies")}</span>
              <input
                type="number"
                min={1}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.maxCompanies}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, maxCompanies: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.trialDays")}</span>
              <input
                type="number"
                min={0}
                max={365}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.trialDays}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, trialDays: Number(event.target.value) }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.graceDays")}</span>
              <input
                type="number"
                min={0}
                max={365}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.graceDays}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, graceDays: Number(event.target.value) }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.currency")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.currency}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, currency: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold">{t("billing.modules")}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {MODULE_OPTIONS.map((option) => (
                <label key={option.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.modules.includes(option.key)}
                    onChange={() => handleToggleModule(option.key)}
                  />
                  {t(option.labelKey)}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                }
              />
              {t("billing.active")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isDefault: event.target.checked }))
                }
              />
              {t("billing.default")}
            </label>
          </div>

          {errorKey ? <p className="mt-2 text-xs text-red-500">{t(errorKey)}</p> : null}

          <div className="mt-4 flex flex-wrap gap-3">
            {editingId ? (
              <>
                <button
                  type="button"
                  onClick={handleUpdate}
                  className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
                  disabled={isPending}
                >
                  {t("billing.updatePlan")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_PLAN);
                  }}
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button
                type="submit"
                className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
                disabled={isPending}
              >
                {t("billing.createPlan")}
              </button>
            )}
          </div>
        </form>
      ) : null}

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("billing.plansList")}
        </div>
        <div className="divide-y divide-border text-sm">
          {plans.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">{t("billing.noPlans")}</div>
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-xs text-muted">{plan.code}</p>
                    <p className="text-xs text-muted">
                      {plan.isActive ? t("billing.active") : t("billing.inactive")}
                    </p>
                    <p className="text-xs text-muted">
                      {plan.currency} {plan.priceMonthly.toFixed(2)} / {t("billing.monthly")}
                    </p>
                  </div>
                  {isAdmin ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        className="rounded-full border border-border px-2 py-1"
                        onClick={() => startEdit(plan)}
                        disabled={isPending}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-red-200 px-2 py-1 text-red-600"
                        onClick={() => handleDeactivate(plan.id)}
                        disabled={isPending}
                      >
                        {t("billing.deactivate")}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted">
                  {t("billing.maxUsers")}: {plan.maxUsers}
                  {plan.trialDays ? ` · ${t("billing.trialDays")}: ${plan.trialDays}` : ""}
                  {plan.graceDays ? ` · ${t("billing.graceDays")}: ${plan.graceDays}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
