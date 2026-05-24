"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { getUnitOptions } from "@/lib/utils/units";

type CreditNoteStatus = "draft" | "issued" | "canceled";

type CreditNoteLine = {
  id: string;
  billLineId?: string | null;
  itemId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  taxCategoryId?: string | null;
  returnToVendor: boolean;
  totalAmount: number;
};

type VendorCreditNote = {
  id: string;
  companyId: string;
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  creditNumber: string;
  status: CreditNoteStatus;
  issueDate: string;
  currency: string;
  notes?: string | null;
  reason?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  lines: CreditNoteLine[];
};

type BillDetail = {
  id: string;
  billNumber: string;
  vendorName: string;
  balance: number;
  currency: string;
  lines: Array<{ id: string; quantity: number }>;
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

const STATUS_STYLES: Record<CreditNoteStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  issued: "bg-blue-100 text-blue-800",
  canceled: "bg-rose-100 text-rose-800",
};

const mapCreditNoteError = (error?: string) => {
  switch (error) {
    case "Credit exceeds balance":
      return "vendorCreditNote.exceedsBalance";
    case "Credit note is locked":
      return "vendorCreditNote.locked";
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

export default function VendorCreditNoteDetailPage() {
  const params = useParams<{ creditNoteId: string }>();
  const creditNoteId = params.creditNoteId;
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [note, setNote] = useState<VendorCreditNote | null>(null);
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [issueDate, setIssueDate] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxMap = useMemo(
    () => new Map(taxCategories.map((tax) => [tax.id, tax])),
    [taxCategories]
  );

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || note?.currency || "SAR",
    }).format(value);

  const loadReferenceData = useCallback(() => {
    if (!note?.companyId) {
      return;
    }
    Promise.all([
      fetch(`/api/items?companyId=${note.companyId}`).then((res) => res.json()),
      fetch(`/api/tax-categories?companyId=${note.companyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/company-defaults?companyId=${note.companyId}`).then((res) =>
        res.json()
      ),
      fetch(`/api/companies/${note.companyId}/config`).then((res) => res.json()),
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
      .catch(() => setErrorKey("error.loadFailed"));
  }, [note]);

  const loadCreditNote = useCallback(async () => {
    setLoadingNote(true);
    const response = await fetch(`/api/vendor-credit-notes/${creditNoteId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setLoadingNote(false);
      return;
    }
    const data = await response.json();
    const nextNote = data.creditNote as VendorCreditNote | undefined;
    if (!nextNote) {
      setErrorKey("error.loadFailed");
      setLoadingNote(false);
      return;
    }
    setNote(nextNote);
    setIssueDate(nextNote.issueDate);
    setReason(nextNote.reason ?? "");
    setNotes(nextNote.notes ?? "");

    const billResponse = await fetch(`/api/bills/${nextNote.billId}`);
    const billData = await billResponse.json().catch(() => ({}));
    const nextBill = billData.bill as BillDetail | undefined;
    setBill(nextBill ?? null);

    const lineMap = new Map(
      (nextBill?.lines ?? []).map((line) => [line.id, line.quantity])
    );

    setLines(
      nextNote.lines.map((line) => ({
        id: line.id ?? crypto.randomUUID(),
        billLineId: line.billLineId ?? "",
        itemId: line.itemId ?? "",
        description: line.description,
        quantity: String(line.quantity),
        unit: line.unit,
        unitPrice: String(line.unitPrice),
        discountRate: String(line.discountRate ?? 0),
        taxCategoryId: line.taxCategoryId ?? "",
        returnToVendor: line.returnToVendor ?? false,
        maxQuantity: line.billLineId ? lineMap.get(line.billLineId) ?? line.quantity : line.quantity,
      }))
    );
    setLoadingNote(false);
  }, [creditNoteId]);

  useEffect(() => {
    loadCreditNote();
  }, [loadCreditNote]);

  useEffect(() => {
    if (note) {
      loadReferenceData();
    }
  }, [loadReferenceData, note]);

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

  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!note) {
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
      setNoticeKey(null);
      const response = await fetch(`/api/vendor-credit-notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueDate,
          notes: notes || null,
          reason: reason || null,
          lines: payloadLines,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCreditNoteError(data?.error));
        return;
      }
      setNoticeKey("vendorCreditNote.saved");
      await loadCreditNote();
    });
  };

  const handleIssue = () => {
    if (!note) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/vendor-credit-notes/${note.id}/issue`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCreditNoteError(data?.error));
        return;
      }
      await loadCreditNote();
    });
  };

  const handleCancel = () => {
    if (!note) {
      return;
    }
    if (!window.confirm(t("vendorCreditNote.cancelConfirm"))) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/vendor-credit-notes/${note.id}/cancel`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCreditNoteError(data?.error));
        return;
      }
      await loadCreditNote();
    });
  };

  if (loadingNote && !note && !errorKey) {
    return (
      <section className="space-y-6 page-shell">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="app-card space-y-4 p-5 card-modern">
          <SkeletonBlock className="h-5 w-36" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-9 w-full" />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-20 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!note) {
    return (
      <section className="space-y-6 page-shell">
        <div className="app-card p-6 text-sm text-muted card-modern">{t("common.loading")}</div>
      </section>
    );
  }

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("vendorCreditNote.detailsTitle")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold page-title">{note.creditNumber}</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[note.status]}`}
            >
              {t(`vendorCreditNote.status.${note.status ?? "draft"}`)}
            </span>
          </div>
          <p className="text-sm text-muted page-subtitle">{note.vendorName}</p>
        </div>
        <Link
          href="/purchases/vendor-credit-notes"
          className="text-xs font-semibold text-muted underline decoration-dotted"
        >
          {t("vendorCreditNote.title")}
        </Link>
      </div>

      <form onSubmit={handleUpdate} className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("vendorCreditNote.detailsSubtitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {note.status === "draft" ? (
              <button
                type="button"
                onClick={handleIssue}
                className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                disabled={isPending}
              >
                {t("vendorCreditNote.issue")}
              </button>
            ) : null}
            {note.status === "draft" ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-muted"
                disabled={isPending}
              >
                {t("vendorCreditNote.cancel")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorCreditNote.issueDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
              disabled={note.status !== "draft"}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("vendorCreditNote.reason")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={note.status !== "draft"}
            />
          </label>
          {bill ? (
            <div className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p className="text-xs text-muted">{bill.billNumber}</p>
              <p className="font-semibold">{bill.vendorName}</p>
              <p className="mt-2 text-xs text-muted">{t("vendorCreditNote.availableBalance")}</p>
              <p className="font-semibold">{formatCurrency(bill.balance, bill.currency)}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t("vendorCreditNote.linesTitle")}</h3>
            <span className="text-xs text-muted">{lines.length}</span>
          </div>
          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-muted page-subtitle">{t("vendorCreditNote.linesEmpty")}</p>
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
                  <div key={line.id} className="grid gap-3 rounded-2xl border border-border p-3 md:grid-cols-7">
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
                        className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                        value={line.quantity}
                        onChange={(event) =>
                          handleLineChange(index, "quantity", event.target.value)
                        }
                        disabled={note.status !== "draft"}
                      />
                    </label>
                    <label className={`text-sm ${alignClass}`}>
                      <span className="mb-1 block text-xs text-muted">{t("bill.unit")}</span>
                      <select
                        className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                        value={line.unit}
                        onChange={(event) => handleLineChange(index, "unit", event.target.value)}
                        disabled={note.status !== "draft"}
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
                        className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                        value={line.unitPrice}
                        onChange={(event) =>
                          handleLineChange(index, "unitPrice", event.target.value)
                        }
                        disabled={note.status !== "draft"}
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
                        disabled={note.status !== "draft"}
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
                        disabled={note.status !== "draft"}
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
                        disabled={note.status !== "draft" || !item?.trackInventory}
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

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={note.status !== "draft"}
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
        {noticeKey ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t(noticeKey)}
          </div>
        ) : null}
        {note.status === "draft" ? (
          <button
            type="submit"
            className="mt-4 rounded-2xl border border-border px-4 py-2 text-sm font-semibold"
            disabled={isPending}
          >
            {t("vendorCreditNote.updateDraft")}
          </button>
        ) : null}
      </form>
    </section>
  );
}
