"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { getUnitOptions } from "@/lib/utils/units";

type BillSummary = {
  id: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  status: string;
  billDate: string;
  dueDate: string;
  total: number;
  balance: number;
  currency: string;
};

type BillLine = {
  id: string;
  itemId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  taxCategoryId?: string | null;
};

type BillDetail = {
  id: string;
  billNumber: string;
  vendorName: string;
  vendorId: string;
  status: string;
  billDate: string;
  dueDate: string;
  total: number;
  balance: number;
  currency: string;
  lines: BillLine[];
};

type Item = {
  id: string;
  name: string;
  type: "product" | "service";
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
  taxCategoryId?: string | null;
  trackInventory: boolean;
};

type TaxCategory = {
  id: string;
  name: string;
  rate: number;
  type: "standard" | "zero" | "exempt";
  status: "active" | "inactive";
};

type CompanyDefaults = {
  defaultPurchaseTaxCategoryId: string | null;
};

type CompanyConfig = {
  taxInclusive: boolean;
};

type LineForm = {
  id: string;
  billLineId: string;
  itemId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountRate: string;
  taxCategoryId: string;
  returnToVendor: boolean;
  maxQuantity: number;
};

const mapCreditNoteError = (error?: string) => {
  switch (error) {
    case "Credit exceeds balance":
      return "vendorCreditNote.exceedsBalance";
    case "Invalid bill":
      return "vendorCreditNote.invalidBill";
    case "Bill is canceled":
      return "vendorCreditNote.billCanceled";
    case "Invalid item":
      return "vendorCreditNote.invalidItem";
    case "Invalid unit":
      return "vendorCreditNote.invalidUnit";
    case "Missing payable account":
      return "vendorCreditNote.missingPayableAccount";
    case "Missing purchases account":
      return "vendorCreditNote.missingPurchasesAccount";
    case "Missing VAT input account":
      return "vendorCreditNote.missingVatInputAccount";
    case "Missing discount account":
      return "vendorCreditNote.missingDiscountAccount";
    case "VAT period is filed":
      return "vat.periodLocked";
    default:
      return "error.saveFailed";
  }
};

export default function NewVendorCreditNotePage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [billId, setBillId] = useState(searchParams.get("billId") ?? "");
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [loadingReference, setLoadingReference] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxMap = useMemo(
    () => new Map(taxCategories.map((tax) => [tax.id, tax])),
    [taxCategories]
  );

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || bill?.currency || "SAR",
    }).format(value);

  useEffect(() => {
    const param = searchParams.get("billId");
    if (param && param !== billId) {
      setBillId(param);
    }
  }, [searchParams, billId]);

  const loadBills = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingBills(true);
    fetch(`/api/bills?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        const rows: BillSummary[] = data.bills ?? [];
        setBills(rows.filter((row) => row.status !== "canceled"));
      })
      .catch(() => setBills([]))
      .finally(() => setLoadingBills(false));
  }, [activeCompanyId]);

  const loadReferenceData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingReference(true);
    Promise.all([
      fetch(`/api/items?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/tax-categories?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/company-defaults?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
    ])
      .then(([itemData, taxData, defaultsData, configData]) => {
        setItems(itemData.items ?? []);
        setTaxCategories(
          (taxData.categories ?? []).filter(
            (category: TaxCategory) => category.status === "active"
          )
        );
        setDefaults(defaultsData.defaults ?? null);
        setConfig({ taxInclusive: Boolean(configData?.config?.taxInclusive) });
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingReference(false));
  }, [activeCompanyId]);

  const loadBillDetail = useCallback(
    async (selectedId: string) => {
      if (!selectedId) {
        setBill(null);
        setLines([]);
        return;
      }
      const response = await fetch(`/api/bills/${selectedId}`);
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const data = await response.json();
      const nextBill = data.bill as BillDetail | undefined;
      if (!nextBill) {
        setBill(null);
        setLines([]);
        return;
      }
      setBill(nextBill);
      const nextLines = nextBill.lines.map((line) => {
        const item = line.itemId ? itemMap.get(line.itemId) : null;
        return {
          id: line.id ?? crypto.randomUUID(),
          billLineId: line.id ?? "",
          itemId: line.itemId ?? "",
          description: line.description,
          quantity: String(line.quantity),
          unit: line.unit,
          unitPrice: String(line.unitPrice),
          discountRate: String(line.discountRate ?? 0),
          taxCategoryId: line.taxCategoryId ?? "",
          returnToVendor: item?.trackInventory ?? false,
          maxQuantity: line.quantity ?? 0,
        };
      });
      setLines(nextLines);
    },
    [itemMap]
  );

  useEffect(() => {
    loadBills();
    loadReferenceData();
  }, [loadBills, loadReferenceData]);

  useEffect(() => {
    if (!billId) {
      setBill(null);
      setLines([]);
      return;
    }
    loadBillDetail(billId);
  }, [billId, loadBillDetail]);

  useEffect(() => {
    if (!items.length || !lines.length) {
      return;
    }
    setLines((prev) => {
      let hasChanges = false;
      const next = prev.map((line) => {
        const item = line.itemId ? itemMap.get(line.itemId) : null;
        if (!item) {
          return line;
        }
        if (line.returnToVendor === Boolean(item.trackInventory)) {
          return line;
        }
        hasChanges = true;
        return { ...line, returnToVendor: Boolean(item.trackInventory) };
      });
      return hasChanges ? next : prev;
    });
  }, [items, itemMap, lines.length]);

  const totals = useMemo(() => {
    const taxInclusive = Boolean(config?.taxInclusive);
    return lines.reduce(
      (acc, line) => {
        const quantity = Number(line.quantity) || 0;
        if (quantity <= 0) {
          return acc;
        }
        const item = itemMap.get(line.itemId);
        if (!item) {
          return acc;
        }
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
      prev.map((line, idx) => {
        if (idx !== index) {
          return line;
        }
        if (field === "quantity") {
          const numeric = Number(value);
          if (!Number.isNaN(numeric)) {
            const clamped = Math.max(0, Math.min(numeric, line.maxQuantity || numeric));
            return { ...line, quantity: String(clamped) };
          }
        }
        return { ...line, [field]: value };
      })
    );
  };

  const handleReturnToggle = (index: number, value: boolean) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, returnToVendor: value } : line))
    );
  };

  const handleSubmit = (status: "draft" | "issued") => {
    if (!activeCompanyId || !billId) {
      setErrorKey("vendorCreditNote.selectBillError");
      return;
    }
    const payloadLines = lines
      .filter((line) => Number(line.quantity) > 0 && line.itemId)
      .map((line) => ({
        id: line.id,
        billLineId: line.billLineId || null,
        itemId: line.itemId,
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        unitPrice: Number(line.unitPrice),
        discountRate: Number(line.discountRate) || 0,
        taxCategoryId: line.taxCategoryId || null,
        returnToVendor: line.returnToVendor,
      }));

    if (payloadLines.length === 0) {
      setErrorKey("vendorCreditNote.linesRequired");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch("/api/vendor-credit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          billId,
          issueDate,
          notes: notes || null,
          reason: reason || null,
          status,
          lines: payloadLines,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCreditNoteError(data?.error));
        return;
      }
      router.push(`/purchases/vendor-credit-notes/${data.creditNoteId}`);
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("vendorCreditNote.createTitle")}</h1>
        <p className="text-sm text-muted">{t("vendorCreditNote.createSubtitle")}</p>
      </div>

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("vendorCreditNote.selectBill")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorCreditNote.bill")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={billId}
              onChange={(event) => setBillId(event.target.value)}
              disabled={loadingBills}
            >
              <option value="">{t("vendorCreditNote.selectBillPlaceholder")}</option>
              {bills.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.billNumber} - {entry.vendorName}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorCreditNote.issueDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
              disabled={loadingBills || loadingReference}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorCreditNote.reason")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={loadingBills || loadingReference}
            />
          </label>
        </div>
        {bill ? (
          <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted">{bill.vendorName}</p>
                <p className="font-semibold">{bill.billNumber}</p>
              </div>
              <div className={alignClass}>
                <p className="text-xs text-muted">{t("vendorCreditNote.availableBalance")}</p>
                <p className="font-semibold">{formatCurrency(bill.balance)}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("vendorCreditNote.linesTitle")}</h2>
          <span className="text-xs text-muted">{lines.length}</span>
        </div>
        {lines.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("vendorCreditNote.linesEmpty")}</p>
        ) : (
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
                <div key={line.id} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-7">
                  <div className={`text-sm ${alignClass} md:col-span-2`}>
                    <p className="text-xs text-muted">{t("bill.item")}</p>
                    <p className="font-semibold">{line.description}</p>
                    <p className="text-xs text-muted">
                      {t("bill.quantity")}: {line.maxQuantity}
                    </p>
                  </div>
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">{t("bill.quantity")}</span>
                    <input
                      type="number"
                      min="0"
                      max={line.maxQuantity}
                      step="0.01"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={line.quantity}
                      onChange={(event) =>
                        handleLineChange(index, "quantity", event.target.value)
                      }
                    />
                  </label>
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">{t("bill.unit")}</span>
                    <select
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={line.unit}
                      onChange={(event) => handleLineChange(index, "unit", event.target.value)}
                    >
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
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={line.discountRate}
                      onChange={(event) =>
                        handleLineChange(index, "discountRate", event.target.value)
                      }
                    />
                  </label>
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">{t("bill.taxCategory")}</span>
                    <select
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                  <label className="flex items-center gap-2 text-xs md:col-span-2">
                    <input
                      type="checkbox"
                      checked={line.returnToVendor}
                      onChange={(event) =>
                        handleReturnToggle(index, event.target.checked)
                      }
                      disabled={!item?.trackInventory}
                    />
                    {t("vendorCreditNote.returnToVendor")}
                  </label>
                  <div className="md:col-span-7 text-xs text-muted">
                    {t("bill.lineTotal")}: {amounts.totalAmount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="app-card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
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
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleSubmit("draft")}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
            disabled={isPending}
          >
            {t("vendorCreditNote.saveDraft")}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit("issued")}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
            disabled={isPending}
          >
            {t("vendorCreditNote.issue")}
          </button>
        </div>
      </div>
    </section>
  );
}
