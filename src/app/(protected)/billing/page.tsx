"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
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
  modules: string[];
  trialDays: number;
  graceDays: number;
  isActive: boolean;
  isDefault: boolean;
};

type Subscription = {
  companyId: string;
  planId: string;
  status: string;
  billingCycle: "monthly" | "yearly";
  trialEndsAt?: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

type Invoice = {
  id: string;
  planName: string;
  amount: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  issuedAt?: string | null;
};

type PaymentMethod = {
  id: string;
  type: "card" | "bank";
  brand?: string | null;
  last4: string;
  expMonth?: number | null;
  expYear?: number | null;
  isDefault: boolean;
};

const MODULE_OPTIONS = [
  { key: "accounting", labelKey: "billing.module.accounting" },
  { key: "payments", labelKey: "billing.module.payments" },
  { key: "inventory", labelKey: "billing.module.inventory" },
  { key: "hr", labelKey: "billing.module.hr" },
  { key: "reports", labelKey: "billing.module.reports" },
];

export default function BillingPortalPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [activePlan, setActivePlan] = useState<BillingPlan | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [usage, setUsage] = useState<{ users: number; maxUsers: number | null } | null>(
    null
  );
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [methodForm, setMethodForm] = useState({
    type: "card",
    brand: "",
    last4: "",
    expMonth: "",
    expYear: "",
    token: "",
    isDefault: true,
  });
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isAdmin = ["owner", "admin"].includes(activeCompany?.role ?? "");

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setLoading(true);
    Promise.all([
      fetch(`/api/billing/subscription?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/billing/plans?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/billing/invoices?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/billing/payment-methods?companyId=${activeCompanyId}`).then(
        (res) => res.json()
      ),
    ])
      .then(([subscriptionData, plansData, invoicesData, methodsData]) => {
        setSubscription(subscriptionData.subscription ?? null);
        setActivePlan(subscriptionData.plan ?? null);
        setUsage(subscriptionData.usage ?? null);
        setPlans(plansData.plans ?? []);
        setInvoices(invoicesData.invoices ?? []);
        setMethods(methodsData.methods ?? []);
        if (subscriptionData.subscription?.planId) {
          setSelectedPlanId(subscriptionData.subscription.planId);
          setBillingCycle(subscriptionData.subscription.billingCycle ?? "monthly");
        }
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoading(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChangePlan = () => {
    if (!activeCompanyId || !selectedPlanId) {
      setErrorKey("billing.errors.selectPlan");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          planId: selectedPlanId,
          billingCycle,
        }),
      });
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      loadData();
    });
  };

  const handleCancel = (cancelAtPeriodEnd: boolean) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, cancelAtPeriodEnd }),
      });
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      loadData();
    });
  };

  const handleReactivate = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/billing/subscription/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      loadData();
    });
  };

  const handleAddMethod = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/billing/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          type: methodForm.type,
          brand: methodForm.brand || null,
          last4: methodForm.last4,
          expMonth: methodForm.expMonth ? Number(methodForm.expMonth) : null,
          expYear: methodForm.expYear ? Number(methodForm.expYear) : null,
          token: methodForm.token,
          isDefault: methodForm.isDefault,
        }),
      });
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      setMethodForm({
        type: "card",
        brand: "",
        last4: "",
        expMonth: "",
        expYear: "",
        token: "",
        isDefault: true,
      });
      loadData();
    });
  };

  const handleMakeDefault = (methodId: string) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/billing/payment-methods/${methodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, isDefault: true }),
      });
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      loadData();
    });
  };

  const handleRemoveMethod = (methodId: string) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/billing/payment-methods/${methodId}?companyId=${activeCompanyId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      loadData();
    });
  };

  const handleInvoiceStatus = (invoiceId: string, status: string) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/billing/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, status }),
      });
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      loadData();
    });
  };

  const handleOverrideStatus = (status: string) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/billing/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, status }),
      });
      if (!response.ok) {
        setErrorKey("billing.errors.updateFailed");
        return;
      }
      loadData();
    });
  };

  const statusLabel = (value?: string | null) => {
    if (!value) return "-";
    return t(`billing.status.${value}`);
  };

  const cycleLabel = billingCycle === "yearly" ? t("billing.yearly") : t("billing.monthly");

  const formattedModules = useMemo(() => {
    if (!activePlan) {
      return [];
    }
    return MODULE_OPTIONS.filter((option) => activePlan.modules.includes(option.key)).map(
      (option) => t(option.labelKey)
    );
  }, [activePlan, t]);

  const formatDate = (value?: string | null) => {
    if (!value) return "--";
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(value));
  };

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("billing.title")}</h1>
        <p className="text-sm text-muted">{t("billing.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="app-card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">{t("billing.currentPlan")}</h2>
          {loading ? (
            <div className="mt-4 space-y-3">
              <SkeletonBlock className="h-3 w-48" />
              <SkeletonBlock className="h-3 w-64" />
              <SkeletonBlock className="h-3 w-56" />
              <SkeletonBlock className="h-3 w-40" />
            </div>
          ) : subscription && activePlan ? (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <span className="font-semibold">{activePlan.name}</span>{" "}
                <span className="text-xs text-muted">({activePlan.code})</span>
              </p>
              <p className="text-xs text-muted">
                {t("billing.statusLabel")}: {statusLabel(subscription.status)}
              </p>
              <p className="text-xs text-muted">
                {t("billing.billingCycle")}: {cycleLabel}
              </p>
              <p className="text-xs text-muted">
                {t("billing.period")} {formatDate(subscription.currentPeriodStart)} →{" "}
                {formatDate(subscription.currentPeriodEnd)}
              </p>
              {subscription.trialEndsAt ? (
                <p className="text-xs text-muted">
                  {t("billing.trialEnds")}: {formatDate(subscription.trialEndsAt)}
                </p>
              ) : null}
              {usage ? (
                <p className="text-xs text-muted">
                  {t("billing.users")}: {usage.users}
                  {usage.maxUsers ? ` / ${usage.maxUsers}` : ""}
                </p>
              ) : null}
              {formattedModules.length > 0 ? (
                <p className="text-xs text-muted">
                  {t("billing.modules")}: {formattedModules.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("billing.noSubscription")}</p>
          )}
        </div>
        <div className="app-card p-5">
          <h2 className="text-lg font-semibold">{t("billing.actions")}</h2>
          <div className="mt-3 flex flex-col gap-2">
            {subscription?.status === "canceled" ? (
              <button
                type="button"
                onClick={handleReactivate}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
              >
                {t("billing.reactivate")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleCancel(true)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
                >
                  {t("billing.cancelAtPeriod")}
                </button>
                <button
                  type="button"
                  onClick={() => handleCancel(false)}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
                >
                  {t("billing.cancelNow")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("billing.changePlan")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("billing.selectPlan")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
            >
              <option value="">{t("billing.selectPlanPlaceholder")}</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({formatCurrency(plan.priceMonthly, plan.currency)})
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("billing.billingCycle")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={billingCycle}
              onChange={(event) => setBillingCycle(event.target.value as "monthly" | "yearly")}
            >
              <option value="monthly">{t("billing.monthly")}</option>
              <option value="yearly">{t("billing.yearly")}</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleChangePlan}
              className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              disabled={isPending}
            >
              {t("billing.applyPlan")}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("billing.paymentMethods")}</h2>
            {isAdmin ? (
              <a
                href={
                  activeCompanyId
                    ? `/api/billing/payment-methods/export?companyId=${activeCompanyId}`
                    : "#"
                }
                className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
                  activeCompanyId ? "" : "pointer-events-none opacity-60"
                }`}
              >
                {t("billing.exportMethods")}
              </a>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted">{t("billing.methodsSubtitle")}</p>
          <div className="mt-3 space-y-2 text-sm">
            {loading ? (
              <div className="space-y-2">
                <SkeletonBlock className="h-8 w-full" />
                <SkeletonBlock className="h-8 w-5/6" />
              </div>
            ) : methods.length === 0 ? (
              <p className="text-sm text-muted">{t("billing.noPaymentMethods")}</p>
            ) : (
              methods.map((method) => (
                <div
                  key={method.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <span>
                    {method.brand ?? method.type} •••• {method.last4}
                    {method.expMonth ? ` (${method.expMonth}/${method.expYear})` : ""}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {method.isDefault ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-600">
                        {t("billing.default")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rounded-full border border-border px-2 py-1"
                        onClick={() => handleMakeDefault(method.id)}
                        disabled={isPending}
                      >
                        {t("billing.makeDefault")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-full border border-red-200 px-2 py-1 text-red-600"
                      onClick={() => handleRemoveMethod(method.id)}
                      disabled={isPending}
                    >
                      {t("billing.remove")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {isAdmin ? (
            <form onSubmit={handleAddMethod} className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold">{t("billing.addPaymentMethod")}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("billing.methodType")}</span>
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={methodForm.type}
                    onChange={(event) =>
                      setMethodForm((prev) => ({ ...prev, type: event.target.value }))
                    }
                  >
                    <option value="card">{t("billing.method.card")}</option>
                    <option value="bank">{t("billing.method.bank")}</option>
                  </select>
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("billing.methodBrand")}</span>
                  <input
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={methodForm.brand}
                    onChange={(event) =>
                      setMethodForm((prev) => ({ ...prev, brand: event.target.value }))
                    }
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("billing.methodLast4")}</span>
                  <input
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={methodForm.last4}
                    maxLength={4}
                    onChange={(event) =>
                      setMethodForm((prev) => ({ ...prev, last4: event.target.value }))
                    }
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("billing.methodToken")}</span>
                  <input
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={methodForm.token}
                    onChange={(event) =>
                      setMethodForm((prev) => ({ ...prev, token: event.target.value }))
                    }
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("billing.methodExpMonth")}</span>
                  <input
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={methodForm.expMonth}
                    onChange={(event) =>
                      setMethodForm((prev) => ({ ...prev, expMonth: event.target.value }))
                    }
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("billing.methodExpYear")}</span>
                  <input
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={methodForm.expYear}
                    onChange={(event) =>
                      setMethodForm((prev) => ({ ...prev, expYear: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={methodForm.isDefault}
                  onChange={(event) =>
                    setMethodForm((prev) => ({ ...prev, isDefault: event.target.checked }))
                  }
                />
                {t("billing.makeDefault")}
              </label>
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
                disabled={isPending}
              >
                {t("billing.addMethod")}
              </button>
            </form>
          ) : null}
        </div>

        <div className="app-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("billing.invoices")}</h2>
            {isAdmin ? (
              <a
                href={
                  activeCompanyId
                    ? `/api/billing/invoices/export?companyId=${activeCompanyId}`
                    : "#"
                }
                className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
                  activeCompanyId ? "" : "pointer-events-none opacity-60"
                }`}
              >
                {t("billing.exportInvoices")}
              </a>
            ) : null}
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {loading ? (
              <div className="space-y-2">
                <SkeletonBlock className="h-8 w-full" />
                <SkeletonBlock className="h-8 w-5/6" />
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-muted">{t("billing.noInvoices")}</p>
            ) : (
              invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="rounded-xl border border-border px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{invoice.planName}</span>
                    <span className="text-xs text-muted">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDate(invoice.periodStart)} → {formatDate(invoice.periodEnd)}
                  </p>
                  <p className="text-xs text-muted">
                    {t("billing.invoiceStatus")}: {t(`billing.invoice.${invoice.status}`)}
                  </p>
                  {isAdmin ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        className="rounded-full border border-border px-2 py-1"
                        onClick={() => handleInvoiceStatus(invoice.id, "paid")}
                        disabled={isPending}
                      >
                        {t("billing.markPaid")}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border px-2 py-1"
                        onClick={() => handleInvoiceStatus(invoice.id, "failed")}
                        disabled={isPending}
                      >
                        {t("billing.markFailed")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="app-card p-5">
          <h2 className="text-lg font-semibold">{t("billing.adminTitle")}</h2>
          <p className="text-sm text-muted">{t("billing.adminSubtitle")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("billing.overrideStatus")}</span>
              <select
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={subscription?.status ?? "active"}
                onChange={(event) => handleOverrideStatus(event.target.value)}
              >
                <option value="trialing">{t("billing.status.trialing")}</option>
                <option value="active">{t("billing.status.active")}</option>
                <option value="past_due">{t("billing.status.past_due")}</option>
                <option value="suspended">{t("billing.status.suspended")}</option>
                <option value="canceled">{t("billing.status.canceled")}</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}
