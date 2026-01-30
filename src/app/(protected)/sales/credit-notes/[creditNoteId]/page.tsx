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
  invoiceLineId?: string | null;
  itemId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  taxCategoryId?: string | null;
  restock: boolean;
  totalAmount: number;
};

type CreditNote = {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
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
  refundedAmount?: number;
  lines: CreditNoteLine[];
};

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  customerName: string;
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
  defaultSalesTaxCategoryId: string | null;
};

type CompanyConfig = {
  taxInclusive: boolean;
};

type CashAccount = {
  id: string;
  name: string;
  currency?: string | null;
};

type CreditNoteRefund = {
  id: string;
  refundDate: string;
  amount: number;
  accountId: string;
  reference?: string | null;
};

type LineForm = {
  id: string;
  invoiceLineId: string;
  itemId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountRate: string;
  taxCategoryId: string;
  restock: boolean;
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
      return "creditNote.exceedsBalance";
    case "Credit note is locked":
      return "creditNote.locked";
    case "Invalid invoice":
      return "creditNote.invalidInvoice";
    case "Invoice is canceled":
      return "creditNote.invoiceCanceled";
    case "Invalid item":
      return "creditNote.invalidItem";
    case "Invalid unit":
      return "creditNote.invalidUnit";
    case "Missing receivable account":
      return "creditNote.missingReceivableAccount";
    case "Missing sales account":
      return "creditNote.missingSalesAccount";
    case "Missing VAT output account":
      return "creditNote.missingVatOutputAccount";
    case "Missing discount account":
      return "creditNote.missingDiscountAccount";
    case "Invalid payment account":
      return "creditNote.invalidPaymentAccount";
    case "Refund exceeds credit note":
      return "creditNote.refundExceeds";
    case "VAT period is filed":
      return "vat.periodLocked";
    default:
      return "error.saveFailed";
  }
};

export default function CreditNoteDetailPage() {
  const params = useParams<{ creditNoteId: string }>();
  const creditNoteId = params.creditNoteId;
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [note, setNote] = useState<CreditNote | null>(null);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [refunds, setRefunds] = useState<CreditNoteRefund[]>([]);
  const [loadingNote, setLoadingNote] = useState(false);
  const [loadingRefunds, setLoadingRefunds] = useState(false);
  const [issueDate, setIssueDate] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState("");
  const [refundAccountId, setRefundAccountId] = useState("");
  const [refundReference, setRefundReference] = useState("");
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

  const formatDate = (value: string) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
  };

  const loadNote = useCallback(async () => {
    setLoadingNote(true);
    const response = await fetch(`/api/credit-notes/${creditNoteId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setLoadingNote(false);
      return;
    }
    const data = await response.json();
    const nextNote = data.creditNote as CreditNote | undefined;
    if (!nextNote) {
      setNote(null);
      setLoadingNote(false);
      return;
    }
    setNote(nextNote);
    setIssueDate(nextNote.issueDate);
    setReason(nextNote.reason ?? "");
    setNotes(nextNote.notes ?? "");
    const nextLines = nextNote.lines.map((line) => ({
      id: line.id ?? crypto.randomUUID(),
      invoiceLineId: line.invoiceLineId ?? "",
      itemId: line.itemId ?? "",
      description: line.description,
      quantity: String(line.quantity),
      unit: line.unit,
      unitPrice: String(line.unitPrice),
      discountRate: String(line.discountRate ?? 0),
      taxCategoryId: line.taxCategoryId ?? "",
      restock: line.restock ?? false,
      maxQuantity: line.quantity ?? 0,
    }));
    setLines(nextLines);
    setLoadingNote(false);
  }, [creditNoteId]);

  const loadReferenceData = useCallback(async (companyId: string) => {
    Promise.all([
      fetch(`/api/items?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/tax-categories?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/company-defaults?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/companies/${companyId}/config`).then((res) => res.json()),
      fetch(`/api/cash-bank-accounts?companyId=${companyId}`).then((res) => res.json()),
    ])
      .then(([itemData, taxData, defaultsData, configData, cashData]) => {
        setItems(itemData.items ?? []);
        setTaxCategories(
          (taxData.categories ?? []).filter(
            (category: TaxCategory) => category.status === "active"
          )
        );
        setDefaults(defaultsData.defaults ?? null);
        setConfig({ taxInclusive: Boolean(configData?.config?.taxInclusive) });
        setCashAccounts(cashData.accounts ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, []);

  const loadInvoice = useCallback(async (invoiceIdValue: string) => {
    const response = await fetch(`/api/invoices/${invoiceIdValue}`);
    if (!response.ok) {
      setInvoice(null);
      return;
    }
    const data = await response.json();
    setInvoice(data.invoice ?? null);
  }, []);

  const loadRefunds = useCallback(async () => {
    setLoadingRefunds(true);
    const response = await fetch(`/api/credit-notes/${creditNoteId}/refunds`);
    if (!response.ok) {
      setRefunds([]);
      setLoadingRefunds(false);
      return;
    }
    const data = await response.json();
    setRefunds(data.refunds ?? []);
    setLoadingRefunds(false);
  }, [creditNoteId]);

  useEffect(() => {
    loadNote();
  }, [loadNote]);

  useEffect(() => {
    if (!note) {
      return;
    }
    loadReferenceData(note.companyId);
    loadInvoice(note.invoiceId);
  }, [note?.companyId, note?.invoiceId, loadInvoice, loadReferenceData]);

  useEffect(() => {
    if (!note?.id) {
      return;
    }
    loadRefunds();
  }, [note?.id, loadRefunds]);

  useEffect(() => {
    if (!invoice || lines.length === 0) {
      return;
    }
    const maxMap = new Map(invoice.lines.map((line) => [line.id, line.quantity]));
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        maxQuantity: maxMap.get(line.invoiceLineId) ?? line.maxQuantity,
      }))
    );
  }, [invoice]);

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
          line.taxCategoryId || item.taxCategoryId || defaults?.defaultSalesTaxCategoryId || "";
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

  const handleRestockToggle = (index: number, value: boolean) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, restock: value } : line))
    );
  };

  const handleSave = () => {
    if (!note) {
      return;
    }
    const payloadLines = lines
      .filter((line) => Number(line.quantity) > 0 && line.itemId)
      .map((line) => ({
        id: line.id,
        invoiceLineId: line.invoiceLineId || null,
        itemId: line.itemId,
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        unitPrice: Number(line.unitPrice),
        discountRate: Number(line.discountRate) || 0,
        taxCategoryId: line.taxCategoryId || null,
        restock: line.restock,
      }));

    if (payloadLines.length === 0) {
      setErrorKey("creditNote.linesRequired");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/credit-notes/${creditNoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueDate,
          reason: reason || null,
          notes: notes || null,
          lines: payloadLines,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCreditNoteError(data?.error));
        return;
      }
      setNoticeKey("creditNote.saved");
      await loadNote();
    });
  };

  const handleIssue = () => {
    if (!note) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/credit-notes/${creditNoteId}/issue`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCreditNoteError(data?.error));
        return;
      }
      await loadNote();
    });
  };

  const handleCancel = () => {
    if (!note) {
      return;
    }
    const confirmed = window.confirm(t("creditNote.cancelConfirm"));
    if (!confirmed) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/credit-notes/${creditNoteId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      await loadNote();
    });
  };

  const handleSend = () => {
    if (!note) return;
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/credit-notes/${creditNoteId}/send`, {
        method: "POST",
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setNoticeKey("creditNote.sent");
    });
  };

  const handleRefund = () => {
    if (!note) {
      return;
    }
    const amount = Number(refundAmount);
    if (!refundDate || !refundAccountId || !amount || Number.isNaN(amount)) {
      setErrorKey("error.saveFailed");
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/credit-notes/${creditNoteId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: note.companyId,
          refundDate,
          amount,
          accountId: refundAccountId,
          reference: refundReference || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapCreditNoteError(data?.error));
        return;
      }
      setRefundAmount("");
      setRefundDate("");
      setRefundAccountId("");
      setRefundReference("");
      setNoticeKey("creditNote.refunded");
      await loadNote();
      await loadRefunds();
    });
  };

  if (loadingNote && !note && !errorKey) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="app-card space-y-4 p-5">
          <SkeletonBlock className="h-5 w-36" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-9 w-full" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="app-card space-y-3 p-5">
          <SkeletonBlock className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-10 w-full" />
          ))}
        </div>
        <div className="app-card space-y-3 p-5">
          <SkeletonBlock className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-4 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!note) {
    return (
      <section className="space-y-6">
        <div className="app-card p-5 text-sm text-muted">{t("common.loading")}</div>
      </section>
    );
  }

  const isDraft = note.status === "draft";
  const displayTotals = isDraft
    ? totals
    : {
        subtotal: note.subtotal,
        discountTotal: note.discountTotal,
        taxTotal: note.taxTotal,
        total: note.total,
      };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("creditNote.detailsTitle")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{note.creditNumber}</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[note.status]}`}
            >
              {t(`creditNote.status.${note.status ?? "draft"}`)}
            </span>
          </div>
          <p className="text-sm text-muted">{note.customerName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/sales/credit-notes"
            className="text-xs font-semibold text-muted underline decoration-dotted"
          >
            {t("creditNote.title")}
          </Link>
          {!isDraft ? (
            <button
              type="button"
              onClick={handleSend}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              disabled={isPending}
            >
              {t("creditNote.send")}
            </button>
          ) : null}
          {isDraft ? (
            <>
              <button
                type="button"
                onClick={handleIssue}
                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast"
                disabled={isPending}
              >
                {t("creditNote.issue")}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
                disabled={isPending}
              >
                {t("creditNote.cancel")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {noticeKey ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t(noticeKey)}
        </div>
      ) : null}

      <div className="app-card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted">{t("creditNote.invoice")}</p>
            <Link
              href={`/sales/invoices/${note.invoiceId}`}
              className="font-semibold text-primary underline decoration-dotted"
            >
              {note.invoiceNumber}
            </Link>
          </div>
          <div>
            <p className="text-xs text-muted">{t("creditNote.issueDate")}</p>
            {isDraft ? (
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            ) : (
              <p className="font-semibold">{formatDate(note.issueDate)}</p>
            )}
          </div>
          <div className={alignClass}>
            <p className="text-xs text-muted">{t("creditNote.availableBalance")}</p>
            <p className="font-semibold">{formatCurrency(invoice?.balance ?? 0)}</p>
          </div>
        </div>
        {isDraft ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("creditNote.reason")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <>
            {note.reason ? (
              <p className="mt-4 text-sm text-muted">
                {t("creditNote.reason")}: {note.reason}
              </p>
            ) : null}
            {note.notes ? (
              <p className="mt-2 text-sm text-muted">
                {t("common.notes")}: {note.notes}
              </p>
            ) : null}
          </>
        )}
      </div>

      {!isDraft ? (
        <div className="app-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("creditNote.refundTitle")}</h2>
            <span className="text-xs text-muted">
              {t("creditNote.refundAvailable", {
                amount: String(
                  Math.max((note.total ?? 0) - (note.refundedAmount ?? 0), 0)
                ),
              })}
            </span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("creditNote.refundDate")}</span>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={refundDate}
                onChange={(event) => setRefundDate(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("creditNote.refundAmount")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("creditNote.refundAccount")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={refundAccountId}
                onChange={(event) => setRefundAccountId(event.target.value)}
              >
                <option value="">{t("common.select")}</option>
                {cashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.reference")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={refundReference}
                onChange={(event) => setRefundReference(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleRefund}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
            disabled={isPending}
          >
            {t("creditNote.refund")}
          </button>
          <div className="mt-6 border-t border-border/60 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("creditNote.refundHistory")}</h3>
              <span className="text-xs text-muted">{refunds.length}</span>
            </div>
            {loadingRefunds ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-5 w-full" />
                ))}
              </div>
            ) : refunds.length ? (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted text-xs text-muted">
                    <tr>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("creditNote.refundDate")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("creditNote.refundAmount")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("creditNote.refundAccount")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.reference")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((refund) => (
                      <tr key={refund.id} className="border-t border-border/60">
                        <td className="px-3 py-2">{formatDate(refund.refundDate)}</td>
                        <td className="px-3 py-2">
                          {formatCurrency(refund.amount, note?.currency)}
                        </td>
                        <td className="px-3 py-2">
                          {cashAccounts.find((account) => account.id === refund.accountId)
                            ?.name ?? "-"}
                        </td>
                        <td className="px-3 py-2">{refund.reference || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("creditNote.refundHistoryEmpty")}</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("creditNote.linesTitle")}</h2>
          <span className="text-xs text-muted">{lines.length}</span>
        </div>
        {lines.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("creditNote.linesEmpty")}</p>
        ) : isDraft ? (
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
                defaults?.defaultSalesTaxCategoryId ||
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
                    <p className="text-xs text-muted">{t("invoice.item")}</p>
                    <p className="font-semibold">{line.description}</p>
                    <p className="text-xs text-muted">
                      {t("invoice.quantity")}: {line.maxQuantity}
                    </p>
                  </div>
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">{t("invoice.quantity")}</span>
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
                    <span className="mb-1 block text-xs text-muted">{t("invoice.unit")}</span>
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
                    <span className="mb-1 block text-xs text-muted">{t("invoice.unitPrice")}</span>
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
                    <span className="mb-1 block text-xs text-muted">{t("invoice.discount")}</span>
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
                    <span className="mb-1 block text-xs text-muted">{t("invoice.taxCategory")}</span>
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
                      checked={line.restock}
                      onChange={(event) => handleRestockToggle(index, event.target.checked)}
                      disabled={!item?.trackInventory}
                    />
                    {t("creditNote.restock")}
                  </label>
                  <div className="md:col-span-7 text-xs text-muted">
                    {t("invoice.lineTotal")}: {amounts.totalAmount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.item")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.quantity")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.unitPrice")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.lineTotal")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("creditNote.restock")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {note.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="px-3 py-2">{formatCurrency(line.unitPrice)}</td>
                    <td className="px-3 py-2">{formatCurrency(line.totalAmount)}</td>
                    <td className="px-3 py-2">{line.restock ? t("common.yes") : t("common.no")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card p-5">
        <div className="flex items-center justify-between text-sm">
          <span>{t("invoice.subtotal")}</span>
          <span>{displayTotals.subtotal.toFixed(2)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span>{t("invoice.discountTotal")}</span>
          <span>{displayTotals.discountTotal.toFixed(2)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span>{t("invoice.taxTotal")}</span>
          <span>{displayTotals.taxTotal.toFixed(2)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
          <span>{t("invoice.total")}</span>
          <span>{displayTotals.total.toFixed(2)}</span>
        </div>
        {isDraft ? (
          <button
            type="button"
            onClick={handleSave}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
            disabled={isPending}
          >
            {t("creditNote.updateDraft")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
