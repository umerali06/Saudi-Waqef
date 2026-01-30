
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { addDays } from "@/lib/utils/dates";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { getUnitOptions } from "@/lib/utils/units";
import { uploadToCloudinary } from "@/lib/cloudinary-client";

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
  companyId: string;
  vendorId: string;
  vendorName: string;
  vendorBillNumber?: string | null;
  billNumber: string;
  status: "draft" | "approved" | "partially_paid" | "paid" | "canceled";
  billDate: string;
  dueDate: string;
  currency: string;
  paymentTermId?: string | null;
  notes?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountCredited: number;
  balance: number;
  lines: BillLine[];
};

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
  trackInventory: boolean;
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

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

type BillPayment = {
  id: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference?: string;
};

type CreditNoteSummary = {
  id: string;
  creditNumber: string;
  issueDate: string;
  total: number;
  status: "draft" | "issued" | "canceled";
};

type Attachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storage: "cloudinary" | "firestore";
  url?: string;
  content?: string;
  createdAt: string;
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

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

const PAYMENT_METHODS = [
  { value: "cash", label: "bill.paymentMethod.cash" },
  { value: "bank", label: "bill.paymentMethod.bank" },
  { value: "card", label: "bill.paymentMethod.card" },
  { value: "cheque", label: "bill.paymentMethod.cheque" },
  { value: "online", label: "bill.paymentMethod.online" },
  { value: "other", label: "bill.paymentMethod.other" },
];

const isCloudinaryFile = (file: File) =>
  file.type.startsWith("image/") ||
  file.type.startsWith("video/") ||
  file.type === "application/pdf";

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });

const mapBillError = (error?: string) => {
  switch (error) {
    case "Bill is locked":
      return "bill.locked";
    case "Bill cannot be canceled":
      return "bill.cancelBlocked";
    case "Bill has allocations":
      return "bill.hasAllocations";
    case "Invalid vendor":
      return "bill.invalidVendor";
    case "Invalid item":
      return "bill.invalidItem";
    case "Invalid unit":
      return "bill.invalidUnit";
    case "Missing payable account":
      return "bill.missingPayableAccount";
    case "Missing purchases account":
      return "bill.missingPurchasesAccount";
    case "Missing VAT input account":
      return "bill.missingVatInputAccount";
    case "Approval requires owner or admin":
      return "bill.approvalThreshold";
    case "Missing discount account":
      return "bill.missingDiscountAccount";
    case "VAT period is filed":
      return "vat.periodLocked";
    default:
      return "error.saveFailed";
  }
};

const mapPaymentError = (error?: string) => {
  switch (error) {
    case "Amount exceeds balance":
      return "bill.amountExceedsBalance";
    case "Invalid payment account":
      return "bill.invalidPaymentAccount";
    case "Missing payable account":
      return "bill.missingPayableAccount";
    default:
      return "error.saveFailed";
  }
};

export default function BillDetailPage() {
  const params = useParams<{ billId: string }>();
  const billId = params.billId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteSummary[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentTermId, setPaymentTermId] = useState("");
  const [vendorBillNumber, setVendorBillNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxMap = useMemo(
    () => new Map(taxCategories.map((tax) => [tax.id, tax])),
    [taxCategories]
  );

  const isLocked = bill ? bill.status !== "draft" : false;

  const formatCurrency = (value: number, currency?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || bill?.currency || "SAR",
    }).format(value);

  const formatDate = (value: string) => {
    if (!value) {
      return "-";
    }
    const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: value.includes("T") ? "short" : undefined,
    }).format(date);
  };

  const formatPaymentMethod = (method: string) => t(`bill.paymentMethod.${method}`);

  const loadBill = useCallback(async () => {
    const response = await fetch(`/api/bills/${billId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      return;
    }
    const data = await response.json();
    const nextBill = data.bill as BillDetail | undefined;
    setBill(nextBill ?? null);
    if (nextBill) {
      setVendorId(nextBill.vendorId);
      setBillDate(nextBill.billDate);
      setDueDate(nextBill.dueDate);
      setPaymentTermId(nextBill.paymentTermId ?? "");
      setVendorBillNumber(nextBill.vendorBillNumber ?? "");
      setNotes(nextBill.notes ?? "");
      setLines(
        nextBill.lines.map((line) => ({
          id: line.id ?? crypto.randomUUID(),
          itemId: line.itemId ?? "",
          description: line.description,
          quantity: String(line.quantity),
          unit: line.unit,
          unitPrice: String(line.unitPrice),
          discountRate: String(line.discountRate ?? 0),
          taxCategoryId: line.taxCategoryId ?? "",
        }))
      );
    }
  }, [billId]);

  const loadReferenceData = useCallback(() => {
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
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([vendorData, itemData, taxData, termData, defaultsData, configData, accountsData]) => {
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
        setAccounts(
          (accountsData.accounts ?? []).filter((account: Account) => account.isPosting)
        );
      })
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

  const loadPayments = useCallback(async () => {
    const response = await fetch(`/api/bills/${billId}/payments`);
    if (!response.ok) {
      setPayments([]);
      return;
    }
    const data = await response.json();
    setPayments(data.payments ?? []);
  }, [billId]);

  const loadCreditNotes = useCallback(async () => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      billId,
    });
    const response = await fetch(`/api/vendor-credit-notes?${params.toString()}`);
    if (!response.ok) {
      setCreditNotes([]);
      return;
    }
    const data = await response.json();
    setCreditNotes(data.creditNotes ?? []);
  }, [activeCompanyId, billId]);

  const loadAttachments = useCallback(async () => {
    const response = await fetch(`/api/bills/${billId}/attachments`);
    if (!response.ok) {
      setAttachments([]);
      return;
    }
    const data = await response.json();
    setAttachments(data.attachments ?? []);
  }, [billId]);

  useEffect(() => {
    loadBill();
    loadReferenceData();
    loadPayments();
    loadCreditNotes();
    loadAttachments();
  }, [loadAttachments, loadBill, loadCreditNotes, loadPayments, loadReferenceData]);

  useEffect(() => {
    if (!vendorId || paymentTermId) {
      return;
    }
    const vendor = vendors.find((entry) => entry.id === vendorId);
    if (vendor?.paymentTermId) {
      setPaymentTermId(vendor.paymentTermId);
    } else if (defaults?.defaultPurchasePaymentTermId) {
      setPaymentTermId(defaults.defaultPurchasePaymentTermId);
    }
  }, [vendorId, vendors, defaults, paymentTermId]);

  useEffect(() => {
    const term = terms.find((entry) => entry.id === paymentTermId);
    if (!billDate || !term) {
      return;
    }
    setDueDate(addDays(billDate, term.days));
  }, [billDate, paymentTermId, terms]);

  useEffect(() => {
    if (!accounts.length || paymentAccountId) {
      return;
    }
    setPaymentAccountId(accounts[0]?.id ?? "");
  }, [accounts, paymentAccountId]);

  useEffect(() => {
    if (!paymentDate) {
      setPaymentDate(new Date().toISOString().slice(0, 10));
    }
  }, [paymentDate]);

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

  if (!bill) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="app-panel space-y-3 p-4">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-6 w-32" />
            <SkeletonBlock className="h-3 w-full" />
          </div>
          <div className="app-panel space-y-3 p-4">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-6 w-32" />
            <SkeletonBlock className="h-3 w-full" />
          </div>
        </div>
        <div className="app-card space-y-3 p-4">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
      </section>
    );
  }

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
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        itemId: "",
        description: "",
        quantity: "1",
        unit: "",
        unitPrice: "",
        discountRate: "0",
        taxCategoryId: "",
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !bill) {
      return;
    }
    const payloadLines = lines
      .filter((line) => line.itemId)
      .map((line) => ({
        id: line.id,
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
      const response = await fetch(`/api/bills/${billId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      await loadBill();
    });
  };

  const handleApprove = () => {
    if (!bill) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/bills/${bill.id}/approve`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapBillError(data?.error));
        return;
      }
      await loadBill();
      await loadPayments();
    });
  };

  const handleCancel = () => {
    if (!bill) {
      return;
    }
    if (!window.confirm(t("bill.cancelConfirm"))) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/bills/${bill.id}/cancel`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapBillError(data?.error));
        return;
      }
      await loadBill();
      await loadPayments();
    });
  };

  const handleRecordPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bill || !activeCompanyId) {
      return;
    }
    const amountValue = paymentAmount.trim();
    const amount = Number(amountValue);
    if (!amountValue || Number.isNaN(amount) || amount <= 0) {
      setErrorKey("bill.invalidPaymentAmount");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/bills/${bill.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          paymentDate,
          amount,
          method: paymentMethod,
          reference: paymentReference || null,
          accountId: paymentAccountId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPaymentError(data?.error));
        return;
      }
      setPaymentAmount("");
      setPaymentReference("");
      await loadBill();
      await loadPayments();
    });
  };

  const handleUploadAttachment = () => {
    if (!activeCompanyId || !attachmentFile || !bill) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setIsUploading(true);
      try {
        const payload: {
          companyId: string;
          name: string;
          contentType: string;
          size: number;
          storage: "cloudinary" | "firestore";
          url?: string | null;
          content?: string | null;
        } = {
          companyId: activeCompanyId,
          name: attachmentFile.name,
          contentType: attachmentFile.type || "application/octet-stream",
          size: attachmentFile.size,
          storage: "firestore",
        };

        if (isCloudinaryFile(attachmentFile)) {
          const url = await uploadToCloudinary(
            attachmentFile,
            `companies/${activeCompanyId}/bills/${billId}`
          );
          payload.storage = "cloudinary";
          payload.url = url;
        } else {
          if (attachmentFile.size > FIRESTORE_ATTACHMENT_LIMIT) {
            setErrorKey("bill.attachmentTooLarge");
            return;
          }
          const content = await readFileAsDataUrl(attachmentFile);
          payload.storage = "firestore";
          payload.content = content;
        }

        const response = await fetch(`/api/bills/${billId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data?.error === "Attachment too large") {
            setErrorKey("bill.attachmentTooLarge");
          } else {
            setErrorKey("bill.attachmentUploadFailed");
          }
          return;
        }
        setAttachmentFile(null);
        loadAttachments();
      } catch {
        setErrorKey("bill.attachmentUploadFailed");
      } finally {
        setIsUploading(false);
      }
    });
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    startTransition(async () => {
      await fetch(`/api/bills/${billId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      loadAttachments();
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("bill.detailsTitle")}</p>
          <h1 className="text-2xl font-semibold">{bill?.billNumber ?? "-"}</h1>
          {bill ? (
            <p className="text-sm text-muted">
              {bill.vendorName} • {t(`bill.status.${bill.status ?? "draft"}`)}
            </p>
          ) : null}
        </div>
        <Link
          href="/purchases/bills"
          className="text-xs font-semibold text-muted underline decoration-dotted"
        >
          {t("bill.title")}
        </Link>
      </div>

      <form onSubmit={handleUpdate} className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("bill.detailsSubtitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {bill?.status === "draft" ? (
              <button
                type="button"
                onClick={handleApprove}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                disabled={isPending}
              >
                {t("bill.approve")}
              </button>
            ) : null}
            {bill?.status === "draft" || bill?.status === "approved" ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted"
                disabled={isPending}
              >
                {t("bill.cancel")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("bill.vendor")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
              disabled={isLocked}
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
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={vendorBillNumber}
              onChange={(event) => setVendorBillNumber(event.target.value)}
              disabled={isLocked}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.issueDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={billDate}
              onChange={(event) => setBillDate(event.target.value)}
              disabled={isLocked}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.dueDate")}</span>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={isLocked}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("bill.paymentTerm")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={paymentTermId}
              onChange={(event) => setPaymentTermId(event.target.value)}
              disabled={isLocked}
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
              <div key={line.id} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-6">
                <label className={`text-sm ${alignClass} md:col-span-2`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.item")}</span>
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.itemId}
                    onChange={(event) => handleItemSelect(index, event.target.value)}
                    disabled={isLocked}
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
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.quantity}
                    onChange={(event) =>
                      handleLineChange(index, "quantity", event.target.value)
                    }
                    disabled={isLocked}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("bill.unit")}</span>
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.unit}
                    onChange={(event) => handleLineChange(index, "unit", event.target.value)}
                    disabled={isLocked || !item}
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
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={line.unitPrice}
                    onChange={(event) =>
                      handleLineChange(index, "unitPrice", event.target.value)
                    }
                    disabled={isLocked}
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
                    disabled={isLocked}
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
                    disabled={isLocked}
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
                  {!isLocked ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(index)}
                      className="text-xs font-semibold text-red-500"
                      disabled={lines.length === 1}
                    >
                      {t("common.delete")}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {!isLocked ? (
          <button
            type="button"
            onClick={handleAddLine}
            className="mt-4 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground"
          >
            {t("bill.addLine")}
          </button>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isLocked}
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
            {bill ? (
              <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
                <div className="flex items-center justify-between">
                  <span>{t("bill.amountPaid")}</span>
                  <span>{formatCurrency(bill.amountPaid)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>{t("bill.amountCredited")}</span>
                  <span>{formatCurrency(bill.amountCredited)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between font-semibold text-foreground">
                  <span>{t("common.balance")}</span>
                  <span>{formatCurrency(bill.balance)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        {!isLocked ? (
          <button
            type="submit"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("bill.updateDraft")}
          </button>
        ) : null}
      </form>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("bill.paymentsTitle")}</h2>
          <span className="text-xs text-muted">{payments.length}</span>
        </div>
        <p className="mt-1 text-xs text-muted">{t("bill.paymentsSubtitle")}</p>
        {bill && !["draft", "canceled"].includes(bill.status) ? (
          <form onSubmit={handleRecordPayment} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("bill.paymentDate")}</span>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("bill.paymentAmount")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("bill.paymentMethod")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {t(method.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("bill.paymentAccount")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={paymentAccountId}
                onChange={(event) => setPaymentAccountId(event.target.value)}
              >
                <option value="">{t("common.none")}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("bill.paymentReference")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast"
              disabled={isPending}
            >
              {t("bill.paymentRecord")}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("bill.paymentLocked")}</p>
        )}

        {payments.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("bill.paymentDate")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("bill.paymentMethod")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("bill.paymentAmount")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("bill.paymentReference")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-3 py-2">{formatDate(payment.paymentDate)}</td>
                    <td className="px-3 py-2">{formatPaymentMethod(payment.method)}</td>
                    <td className="px-3 py-2">{formatCurrency(payment.amount)}</td>
                    <td className="px-3 py-2">{payment.reference ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("bill.paymentsEmpty")}</p>
        )}
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("bill.creditNotesTitle")}</h2>
          <Link
            href={`/purchases/vendor-credit-notes/new?billId=${billId}`}
            className="text-xs font-semibold text-primary underline decoration-dotted"
          >
            {t("bill.createCreditNote")}
          </Link>
        </div>
        {creditNotes.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("vendorCreditNote.number")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("vendorCreditNote.issueDate")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.amount")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creditNotes.map((note) => (
                  <tr key={note.id}>
                    <td className="px-3 py-2 font-semibold">
                      <Link
                        href={`/purchases/vendor-credit-notes/${note.id}`}
                        className="text-primary underline decoration-dotted"
                      >
                        {note.creditNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{formatDate(note.issueDate)}</td>
                    <td className="px-3 py-2">{formatCurrency(note.total)}</td>
                    <td className="px-3 py-2">
                      {t(`vendorCreditNote.status.${note.status ?? "draft"}`)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/purchases/vendor-credit-notes/${note.id}`}
                        className="text-xs font-semibold text-foreground underline decoration-dotted"
                      >
                        {t("common.view")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("bill.creditNotesEmpty")}</p>
        )}
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("bill.attachmentsTitle")}</h2>
          <span className="text-xs text-muted">{attachments.length}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted">
            <input
              type="file"
              className="block w-full text-xs"
              onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={handleUploadAttachment}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold"
            disabled={isPending || isUploading || !attachmentFile}
          >
            {isUploading ? t("bill.uploading") : t("bill.uploadAttachment")}
          </button>
          <p className="text-xs text-muted">{t("bill.attachmentHint")}</p>
        </div>

        {attachments.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("bill.attachmentName")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("bill.attachmentStorage")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.size")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attachments.map((attachment) => (
                  <tr key={attachment.id}>
                    <td className="px-2 py-2">
                      <p className="font-semibold">{attachment.name}</p>
                      <p className="text-xs text-muted">{attachment.contentType}</p>
                    </td>
                    <td className="px-2 py-2">
                      {attachment.storage === "cloudinary"
                        ? t("bill.storage.cloudinary")
                        : t("bill.storage.firestore")}
                    </td>
                    <td className="px-2 py-2">
                      {attachment.size < 1024
                        ? `${attachment.size} B`
                        : attachment.size < 1024 * 1024
                          ? `${(attachment.size / 1024).toFixed(1)} KB`
                          : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {attachment.storage === "cloudinary" && attachment.url ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-primary"
                          >
                            {t("common.view")}
                          </a>
                        ) : null}
                        {attachment.storage === "firestore" && attachment.content ? (
                          <a
                            href={attachment.content}
                            download={attachment.name}
                            className="font-semibold text-primary"
                          >
                            {t("common.download")}
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="font-semibold text-red-500"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("bill.attachmentsEmpty")}</p>
        )}
      </div>
    </section>
  );
}
