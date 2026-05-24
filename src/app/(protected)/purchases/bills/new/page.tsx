"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { addDays } from "@/lib/utils/dates";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { getUnitOptions } from "@/lib/utils/units";

type Vendor = {
  id: string;
  name: string;
  paymentTermId?: string | null;
  currency?: string;
};

type Item = {
  id: string;
  name: string;
  type: "product" | "service";
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
  purchasePrice?: number | null;
  taxCategoryId?: string | null;
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
};

type CompanyDefaults = {
  defaultPurchaseTaxCategoryId: string | null;
  defaultPurchasePaymentTermId: string | null;
};

type CompanyConfig = {
  taxInclusive: boolean;
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

const EMPTY_LINE = (): LineForm => ({
  id: crypto.randomUUID(),
  itemId: "",
  description: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
  discountRate: "0",
  taxCategoryId: "",
});

const mapBillError = (error?: string) => {
  switch (error) {
    case "Invalid vendor":
      return "bill.invalidVendor";
    case "Invalid item":
      return "bill.invalidItem";
    case "Invalid unit":
      return "bill.invalidUnit";
    case "Vendor is inactive":
      return "bill.vendorInactive";
    case "VAT period is filed":
      return "vat.periodLocked";
    default:
      return "error.saveFailed";
  }
};

export default function NewBillPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const router = useRouter();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paymentTermId, setPaymentTermId] = useState("");
  const [vendorBillNumber, setVendorBillNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([EMPTY_LINE()]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxMap = useMemo(
    () => new Map(taxCategories.map((tax) => [tax.id, tax])),
    [taxCategories]
  );

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    Promise.all([
      fetch(`/api/vendors?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/items?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/tax-categories?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/payment-terms?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/company-defaults?companyId=${activeCompanyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
    ])
      .then(([vendorData, itemData, taxData, termData, defaultsData, configData]) => {
        setVendors(vendorData.vendors ?? []);
        setItems(itemData.items ?? []);
        setTaxCategories(
          (taxData.categories ?? []).filter(
            (category: TaxCategory) => category.status === "active"
          )
        );
        setTerms(termData.terms ?? []);
        setDefaults(defaultsData.defaults ?? null);
        setConfig({ taxInclusive: Boolean(configData?.config?.taxInclusive) });
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const vendor = vendors.find((entry) => entry.id === vendorId);
    if (vendor?.paymentTermId) {
      setPaymentTermId(vendor.paymentTermId);
    } else if (defaults?.defaultPurchasePaymentTermId) {
      setPaymentTermId(defaults.defaultPurchasePaymentTermId);
    }
  }, [vendorId, vendors, defaults]);

  useEffect(() => {
    const term = terms.find((entry) => entry.id === paymentTermId);
    if (!billDate || !term) {
      return;
    }
    setDueDate(addDays(billDate, term.days));
  }, [billDate, paymentTermId, terms]);

  const totals = useMemo(() => {
    const taxInclusive = Boolean(config?.taxInclusive);
    return lines.reduce(
      (acc, line) => {
        const item = itemMap.get(line.itemId);
        if (!item) {
          return acc;
        }
        const quantity = Number(line.quantity) || 0;
        const unitPrice = Number(line.unitPrice) || 0;
        const discountRate = Number(line.discountRate) || 0;
        const taxCategoryId =
          line.taxCategoryId ||
          item.taxCategoryId ||
          defaults?.defaultPurchaseTaxCategoryId ||
          "";
        const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
        const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;
        const amounts = calculateLineAmounts({
          quantity,
          unitPrice,
          discountRate,
          taxRate,
          taxInclusive,
        });
        return {
          subtotal: acc.subtotal + amounts.netAmount,
          discountTotal: acc.discountTotal + amounts.discountAmount,
          taxTotal: acc.taxTotal + amounts.taxAmount,
          total: acc.total + amounts.totalAmount,
        };
      },
      { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 }
    );
  }, [lines, itemMap, taxMap, defaults, config]);

  const handleLineChange = (index: number, field: keyof LineForm, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line))
    );
  };

  const handleItemSelect = (index: number, itemId: string) => {
    const item = itemMap.get(itemId);
    if (!item) {
      handleLineChange(index, "itemId", itemId);
      return;
    }
    setLines((prev) =>
      prev.map((line, idx) =>
        idx === index
          ? {
              ...line,
              itemId: item.id,
              description: item.name,
              unit: item.baseUnit,
              unitPrice: item.purchasePrice ? String(item.purchasePrice) : "",
              taxCategoryId:
                item.taxCategoryId || defaults?.defaultPurchaseTaxCategoryId || "",
            }
          : line
      )
    );
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, EMPTY_LINE()]);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    if (!vendorId) {
      setErrorKey("bill.selectVendor");
      return;
    }

    const payloadLines = lines
      .filter((line) => line.itemId)
      .map((line) => ({
        itemId: line.itemId,
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        unitPrice: Number(line.unitPrice),
        discountRate: Number(line.discountRate) || 0,
        taxCategoryId: line.taxCategoryId || null,
      }));

    if (payloadLines.length === 0) {
      setErrorKey("bill.linesRequired");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          vendorId,
          billDate,
          dueDate,
          paymentTermId: paymentTermId || null,
          vendorBillNumber: vendorBillNumber || null,
          notes: notes || null,
          lines: payloadLines,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapBillError(data?.error));
        return;
      }
      router.push(`/purchases/bills/${data.billId}`);
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("bill.createTitle")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("bill.createSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="app-card p-6 card-modern">
        <h2 className="text-lg font-semibold">{t("bill.vendorSection")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("bill.vendor")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
              required
            >
              <option value="">{t("bill.selectVendor")}</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("bill.vendorBill")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={vendorBillNumber}
              onChange={(event) => setVendorBillNumber(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.issueDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={billDate}
              onChange={(event) => setBillDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.dueDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("bill.paymentTerm")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={paymentTermId}
              onChange={(event) => setPaymentTermId(event.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} ({term.days} {t("defaults.days")})
                </option>
              ))}
            </select>
          </label>
        </div>

        <h3 className="mt-6 text-sm font-semibold">{t("bill.linesTitle")}</h3>
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
            const taxCategoryId =
              line.taxCategoryId ||
              item?.taxCategoryId ||
              defaults?.defaultPurchaseTaxCategoryId ||
              "";
            const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
            const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;
            const amounts = calculateLineAmounts({
              quantity: Number(line.quantity) || 0,
              unitPrice: Number(line.unitPrice) || 0,
              discountRate: Number(line.discountRate) || 0,
              taxRate,
              taxInclusive: Boolean(config?.taxInclusive),
            });
            return (
              <div key={line.id} className="grid gap-3 rounded-2xl border border-border p-3 md:grid-cols-6">
                <label className={`text-sm ${alignClass} md:col-span-2`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.item")}</span>
                  <select
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.itemId}
                    onChange={(event) => handleItemSelect(index, event.target.value)}
                  >
                    <option value="">{t("bill.selectItem")}</option>
                    {items.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.quantity")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.quantity}
                    onChange={(event) => handleLineChange(index, "quantity", event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.unit")}</span>
                  <select
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.unit}
                    onChange={(event) => handleLineChange(index, "unit", event.target.value)}
                    disabled={!item}
                  >
                    <option value="">{t("common.none")}</option>
                    {unitOptions.map((option) => (
                      <option key={option.unit} value={option.unit}>
                        {option.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.unitPrice")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.unitPrice}
                    onChange={(event) =>
                      handleLineChange(index, "unitPrice", event.target.value)
                    }
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.discount")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.discountRate}
                    onChange={(event) =>
                      handleLineChange(index, "discountRate", event.target.value)
                    }
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.taxCategory")}</span>
                  <select
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.taxCategoryId}
                    onChange={(event) =>
                      handleLineChange(index, "taxCategoryId", event.target.value)
                    }
                  >
                    <option value="">{t("common.none")}</option>
                    {taxCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.rate}%)
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-between gap-3 md:col-span-6">
                  <p className="text-xs text-muted">
                    {t("bill.lineTotal")}: {amounts.totalAmount.toFixed(2)}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(index)}
                    className="text-xs font-semibold text-red-500"
                    disabled={lines.length === 1}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleAddLine}
          className="mt-4 rounded-2xl border border-border px-3 py-2 text-xs font-semibold text-foreground"
        >
          {t("bill.addLine")}
        </button>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <div className="rounded-2xl border border-border bg-surface-muted p-4 text-sm">
            <div className="flex items-center justify-between">
              <span>{t("bill.subtotal")}</span>
              <span>{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>{t("bill.discountTotal")}</span>
              <span>{totals.discountTotal.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>{t("bill.taxTotal")}</span>
              <span>{totals.taxTotal.toFixed(2)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
              <span>{t("bill.total")}</span>
              <span>{totals.total.toFixed(2)}</span>
            </div>
          </div>
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
          {t("bill.saveDraft")}
        </button>
      </form>
    </section>
  );
}
