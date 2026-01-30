"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { getUnitOptions } from "@/lib/utils/units";

type Customer = { id: string; name: string; currency?: string };
type Item = {
  id: string;
  name: string;
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
  taxCategoryId?: string | null;
};
type TaxCategory = { id: string; name: string; rate: number; status: string };
type Recurring = {
  id: string;
  customerName: string;
  customerId: string;
  frequency: "weekly" | "monthly";
  nextRunDate: string;
  status: "active" | "paused";
  template?: {
    dueDays?: number;
    lines?: Array<{
      id?: string;
      itemId: string;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      discountRate?: number;
      taxCategoryId?: string | null;
    }>;
  };
};

type LineForm = {
  id: string;
  itemId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountRate: string;
  taxCategoryId: string;
};

export default function RecurringInvoicesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [nextRunDate, setNextRunDate] = useState("");
  const [dueDays, setDueDays] = useState("30");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lines, setLines] = useState<LineForm[]>([
    {
      id: crypto.randomUUID(),
      itemId: "",
      description: "",
      quantity: "1",
      unit: "",
      unitPrice: "0",
      discountRate: "0",
      taxCategoryId: "",
    },
  ]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const formatDate = useCallback(
    (value: string) => {
      if (!value) {
        return "-";
      }
      const date = new Date(`${value}T00:00:00Z`);
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
    },
    [locale]
  );

  const loadReference = useCallback(() => {
    if (!activeCompanyId) return;
    setLoadingData(true);
    Promise.all([
      fetch(`/api/items?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/customers?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/tax-categories?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/recurring-invoices?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([itemData, customerData, taxData, recurringData]) => {
        setItems(itemData.items ?? []);
        setCustomers(customerData.customers ?? []);
        setTaxCategories(
          (taxData.categories ?? []).filter((c: TaxCategory) => c.status === "active")
        );
        setRecurring(recurringData.recurring ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingData(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadReference();
  }, [loadReference]);

  const handleLineChange = (index: number, field: keyof LineForm, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line))
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        itemId: "",
        description: "",
        quantity: "1",
        unit: "",
        unitPrice: "0",
        discountRate: "0",
        taxCategoryId: "",
      },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) return;

    const payloadLines = lines
      .filter((line) => line.itemId && Number(line.quantity) > 0)
      .map((line) => ({
        id: line.id,
        itemId: line.itemId,
        description: line.description || itemMap.get(line.itemId)?.name || "",
        quantity: Number(line.quantity),
        unit: line.unit,
        unitPrice: Number(line.unitPrice),
        discountRate: Number(line.discountRate) || 0,
        taxCategoryId: line.taxCategoryId || null,
      }));

    if (!customerId || payloadLines.length === 0 || !nextRunDate) {
      setErrorKey("error.saveFailed");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const endpoint = editingId
        ? `/api/recurring-invoices/${editingId}`
        : "/api/recurring-invoices";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? {
            frequency,
            nextRunDate,
            template: {
              invoiceDateOffsetDays: 0,
              dueDays: Number(dueDays) || 0,
              lines: payloadLines,
            },
          }
        : {
            companyId: activeCompanyId,
            customerId,
            frequency,
            nextRunDate,
            template: {
              invoiceDateOffsetDays: 0,
              dueDays: Number(dueDays) || 0,
              lines: payloadLines,
            },
          };
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setNoticeKey(editingId ? "sales.recurringUpdated" : "sales.recurringCreated");
      setCustomerId("");
      setNextRunDate("");
      setDueDays("30");
      setEditingId(null);
      setLines([
        {
          id: crypto.randomUUID(),
          itemId: "",
          description: "",
          quantity: "1",
          unit: "",
          unitPrice: "0",
          discountRate: "0",
          taxCategoryId: "",
        },
      ]);
      loadReference();
    });
  };

  const handleEdit = (item: Recurring) => {
    setEditingId(item.id);
    setCustomerId(item.customerId);
    setFrequency(item.frequency);
    setNextRunDate(item.nextRunDate);
    setDueDays(String(item.template?.dueDays ?? 30));
    const templateLines = item.template?.lines ?? [];
    if (templateLines.length) {
      setLines(
        templateLines.map((line) => ({
          id: line.id ?? crypto.randomUUID(),
          itemId: line.itemId,
          description: line.description,
          quantity: String(line.quantity),
          unit: line.unit,
          unitPrice: String(line.unitPrice),
          discountRate: String(line.discountRate ?? 0),
          taxCategoryId: line.taxCategoryId ?? "",
        }))
      );
    } else {
      setLines([
        {
          id: crypto.randomUUID(),
          itemId: "",
          description: "",
          quantity: "1",
          unit: "",
          unitPrice: "0",
          discountRate: "0",
          taxCategoryId: "",
        },
      ]);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setCustomerId("");
    setNextRunDate("");
    setDueDays("30");
    setLines([
      {
        id: crypto.randomUUID(),
        itemId: "",
        description: "",
        quantity: "1",
        unit: "",
        unitPrice: "0",
        discountRate: "0",
        taxCategoryId: "",
      },
    ]);
  };

  const handleRun = () => {
    if (!activeCompanyId) return;
    setLoading(true);
    fetch("/api/recurring-invoices/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    })
      .then(() => loadReference())
      .finally(() => setLoading(false));
  };

  const handleToggleStatus = (recurringId: string, status: "active" | "paused") => {
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/recurring-invoices/${recurringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setNoticeKey(status === "active" ? "sales.recurringResumed" : "sales.recurringPaused");
      loadReference();
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("sales.recurringTitle")}</h1>
          <p className="text-sm text-muted">{t("sales.recurringSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
          disabled={loading}
        >
          {t("sales.recurringRun")}
        </button>
      </div>

      {noticeKey ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t(noticeKey)}
        </div>
      ) : null}
      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <form onSubmit={handleCreate} className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {editingId ? t("sales.recurringEdit") : t("sales.recurringCreate")}
          </h2>
          {editingId ? (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-xs font-semibold text-muted underline decoration-dotted"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("customers.customer")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              disabled={loadingData}
            >
              <option value="">{t("common.select")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("sales.recurringFrequency")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as "weekly" | "monthly")}
            >
              <option value="weekly">{t("sales.recurringWeekly")}</option>
              <option value="monthly">{t("sales.recurringMonthly")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("sales.recurringNextRun")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={nextRunDate}
              onChange={(event) => setNextRunDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("sales.recurringDueDays")}</span>
            <input
              type="number"
              min="0"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={dueDays}
              onChange={(event) => setDueDays(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 space-y-3">
          {lines.map((line, index) => {
            const item = itemMap.get(line.itemId);
            const unitOptions = item
              ? getUnitOptions({
                  baseUnit: item.baseUnit,
                  packUnit: item.packUnit,
                  packSize: item.packSize ?? undefined,
                })
              : [];
            return (
              <div key={line.id} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-6">
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.item")}</span>
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.itemId}
                    onChange={(event) => handleLineChange(index, "itemId", event.target.value)}
                  >
                    <option value="">{t("common.select")}</option>
                    {items.map((itemOption) => (
                      <option key={itemOption.id} value={itemOption.id}>
                        {itemOption.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.quantity")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.quantity}
                    onChange={(event) => handleLineChange(index, "quantity", event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.unit")}</span>
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.unit}
                    onChange={(event) => handleLineChange(index, "unit", event.target.value)}
                  >
                    <option value="">{t("common.select")}</option>
                    {unitOptions.map((option) => (
                      <option key={option.unit} value={option.unit}>
                        {option.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.unitPrice")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.unitPrice}
                    onChange={(event) => handleLineChange(index, "unitPrice", event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.discount")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.discountRate}
                    onChange={(event) => handleLineChange(index, "discountRate", event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.taxCategory")}</span>
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.taxCategoryId}
                    onChange={(event) => handleLineChange(index, "taxCategoryId", event.target.value)}
                  >
                    <option value="">{t("common.none")}</option>
                    {taxCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="md:col-span-6 flex items-center justify-between gap-2">
                  <input
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.description}
                    onChange={(event) => handleLineChange(index, "description", event.target.value)}
                    placeholder={t("invoice.description")}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="text-xs font-semibold text-red-500"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addLine}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
          >
            {t("common.addLine")}
          </button>
        </div>
        <button
          type="submit"
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
          disabled={isPending}
        >
          {editingId ? t("common.update") : t("common.save")}
        </button>
      </form>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("sales.recurringList")}</span>
          <span className="text-xs text-muted">{loadingData ? "—" : recurring.length}</span>
        </div>
        {loadingData ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : recurring.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("sales.recurringEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("customers.customer")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("sales.recurringFrequency")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("sales.recurringNextRun")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recurring.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{item.customerName}</td>
                    <td className="px-3 py-2">{t(`sales.recurring.${item.frequency}`)}</td>
                    <td className="px-3 py-2">{formatDate(item.nextRunDate)}</td>
                    <td className="px-3 py-2">{t(`status.${item.status ?? "active"}`)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <Link
                          href={`/sales/recurring#${item.id}`}
                          className="text-foreground underline decoration-dotted"
                        >
                          {t("common.view")}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="text-foreground underline decoration-dotted"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleStatus(
                              item.id,
                              item.status === "active" ? "paused" : "active"
                            )
                          }
                          className="text-foreground underline decoration-dotted"
                          disabled={isPending}
                        >
                          {item.status === "active"
                            ? t("sales.recurringPause")
                            : t("sales.recurringResume")}
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
