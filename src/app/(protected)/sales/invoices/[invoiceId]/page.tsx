"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { addDays } from "@/lib/utils/dates";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { getUnitOptions } from "@/lib/utils/units";

type InvoiceLine = {
  id: string;
  itemId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  taxCategoryId?: string | null;
  taxRate: number;
  taxAmount: number;
  netAmount: number;
  totalAmount: number;
  baseQuantity: number;
};

type InvoiceStatus =
  | "draft"
  | "approved"
  | "sent"
  | "partially_paid"
  | "paid"
  | "canceled";

type SalesInvoice = {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  customerVatNumber?: string;
  billingAddress?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  paymentTermId?: string | null;
  notes?: string | null;
  terms?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountCredited: number;
  balance: number;
  lines: InvoiceLine[];
  openItemId?: string | null;
  journalEntryId?: string | null;
  sentAt?: string | null;
  sentTo?: string | null;
  approvedAt?: string | null;
};

type Customer = {
  id: string;
  name: string;
  email?: string;
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
  salePrice?: number | null;
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
  defaultSalesTaxCategoryId: string | null;
  defaultSalesPaymentTermId: string | null;
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

type InvoicePayment = {
  id: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference?: string | null;
  accountId: string;
};

type CreditNoteSummary = {
  id: string;
  creditNumber: string;
  status: "draft" | "issued" | "canceled";
  issueDate: string;
  total: number;
  currency: string;
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

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  sent: "bg-indigo-100 text-indigo-800",
  partially_paid: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  canceled: "bg-rose-100 text-rose-800",
};

const PAYMENT_METHODS = [
  { value: "cash", label: "invoice.paymentMethod.cash" },
  { value: "bank", label: "invoice.paymentMethod.bank" },
  { value: "card", label: "invoice.paymentMethod.card" },
  { value: "cheque", label: "invoice.paymentMethod.cheque" },
  { value: "online", label: "invoice.paymentMethod.online" },
  { value: "other", label: "invoice.paymentMethod.other" },
];

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

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

export default function InvoiceDetailPage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteSummary[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentTermId, setPaymentTermId] = useState("");
  const [notes, setNotes] = useState("");
  const [termsText, setTermsText] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [sendTo, setSendTo] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxMap = useMemo(
    () => new Map(taxCategories.map((tax) => [tax.id, tax])),
    [taxCategories]
  );

  const formatCurrency = (value: number, currencyCode?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currencyCode || invoice?.currency || "SAR",
    }).format(value);

  const formatPaymentMethod = (method: string) => {
    const match = PAYMENT_METHODS.find((entry) => entry.value === method);
    return match ? t(match.label) : method;
  };

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(
      date
    );
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const loadInvoice = useCallback(async () => {
    const response = await fetch(`/api/invoices/${invoiceId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      return;
    }
    const data = await response.json();
    const nextInvoice = data.invoice as SalesInvoice | undefined;
    setInvoice(nextInvoice ?? null);
    if (nextInvoice) {
      setCustomerId(nextInvoice.customerId);
      setInvoiceDate(nextInvoice.invoiceDate);
      setDueDate(nextInvoice.dueDate);
      setPaymentTermId(nextInvoice.paymentTermId ?? "");
      setNotes(nextInvoice.notes ?? "");
      setTermsText(nextInvoice.terms ?? "");
      const nextLines = nextInvoice.lines.map((line) => ({
        id: line.id ?? crypto.randomUUID(),
        itemId: line.itemId ?? "",
        description: line.description ?? "",
        quantity: String(line.quantity ?? 0),
        unit: line.unit ?? "",
        unitPrice: String(line.unitPrice ?? 0),
        discountRate: String(line.discountRate ?? 0),
        taxCategoryId: line.taxCategoryId ?? "",
      }));
      setLines(nextLines.length ? nextLines : [EMPTY_LINE()]);
    }
  }, [invoiceId]);

  const loadReferenceData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    Promise.all([
      fetch(`/api/customers?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/items?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/tax-categories?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/payment-terms?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/company-defaults?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/companies/${activeCompanyId}/config`).then((res) => res.json()),
      fetch(`/api/coa?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(
        ([customerData, itemData, taxData, termData, defaultsData, configData, accountData]) => {
          setCustomers(customerData.customers ?? []);
          setItems(itemData.items ?? []);
          setTaxCategories(
            (taxData.categories ?? []).filter(
              (category: TaxCategory) => category.status === "active"
            )
          );
          setTerms(termData.terms ?? []);
          setDefaults(defaultsData.defaults ?? null);
          setConfig({ taxInclusive: Boolean(configData?.config?.taxInclusive) });
          const accountsData: Account[] = accountData.accounts ?? [];
          const posting = accountsData.filter(
            (account) => account.isPosting && account.status === "active"
          );
          const assets = posting.filter((account) => account.type === "asset");
          setAccounts(assets.length ? assets : posting);
        }
      )
      .catch(() => setErrorKey("error.loadFailed"));
  }, [activeCompanyId]);

  const loadPayments = useCallback(async () => {
    const response = await fetch(`/api/invoices/${invoiceId}/payments`);
    if (!response.ok) {
      setPayments([]);
      return;
    }
    const data = await response.json();
    setPayments(data.payments ?? []);
  }, [invoiceId]);

  const loadAttachments = useCallback(async () => {
    const response = await fetch(`/api/invoices/${invoiceId}/attachments`);
    if (!response.ok) {
      setAttachments([]);
      return;
    }
    const data = await response.json();
    setAttachments(data.attachments ?? []);
  }, [invoiceId]);

  const loadCreditNotes = useCallback(async () => {
    if (!activeCompanyId) {
      return;
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      invoiceId,
    });
    const response = await fetch(`/api/credit-notes?${params.toString()}`);
    if (!response.ok) {
      setCreditNotes([]);
      return;
    }
    const data = await response.json();
    setCreditNotes(data.creditNotes ?? []);
  }, [activeCompanyId, invoiceId]);

  useEffect(() => {
    if (!invoiceId) {
      return;
    }
    loadInvoice();
    loadPayments();
    loadAttachments();
  }, [invoiceId, loadInvoice, loadPayments, loadAttachments]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (!invoiceId || !activeCompanyId) {
      return;
    }
    loadCreditNotes();
  }, [invoiceId, activeCompanyId, loadCreditNotes]);

  useEffect(() => {
    if (!paymentDate) {
      setPaymentDate(new Date().toISOString().slice(0, 10));
    }
  }, [paymentDate]);

  useEffect(() => {
    if (!invoice) {
      return;
    }
    if (!sendSubject) {
      setSendSubject(
        t("invoice.emailSubjectDefault", { number: invoice.invoiceNumber })
      );
    }
    if (!sendMessage) {
      setSendMessage(
        t("invoice.emailMessageDefault", { number: invoice.invoiceNumber })
      );
    }
  }, [invoice, sendMessage, sendSubject, t]);

  useEffect(() => {
    if (!invoice || !customers.length || sendTo) {
      return;
    }
    const customer = customers.find((entry) => entry.id === invoice.customerId);
    if (customer?.email) {
      setSendTo(customer.email);
    }
  }, [invoice, customers, sendTo]);

  useEffect(() => {
    if (!invoice || invoice.status !== "draft") {
      return;
    }
    const customer = customers.find((entry) => entry.id === customerId);
    if (customer?.paymentTermId) {
      setPaymentTermId(customer.paymentTermId);
    } else if (defaults?.defaultSalesPaymentTermId) {
      setPaymentTermId(defaults.defaultSalesPaymentTermId);
    }
  }, [customerId, customers, defaults, invoice]);

  useEffect(() => {
    if (!invoice || invoice.status !== "draft") {
      return;
    }
    const term = terms.find((entry) => entry.id === paymentTermId);
    if (!invoiceDate || !term) {
      return;
    }
    setDueDate(addDays(invoiceDate, term.days));
  }, [invoice, invoiceDate, paymentTermId, terms]);

  useEffect(() => {
    if (!accounts.length || paymentAccountId) {
      return;
    }
    setPaymentAccountId(accounts[0]?.id ?? "");
  }, [accounts, paymentAccountId]);

  const isDraft = invoice?.status === "draft";

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
          defaults?.defaultSalesTaxCategoryId ||
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

  const displayTotals = invoice
    ? isDraft
      ? totals
      : {
          subtotal: invoice.subtotal,
          discountTotal: invoice.discountTotal,
          taxTotal: invoice.taxTotal,
          total: invoice.total,
        }
    : totals;

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
              unitPrice: item.salePrice ? String(item.salePrice) : "",
              taxCategoryId:
                item.taxCategoryId || defaults?.defaultSalesTaxCategoryId || "",
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

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invoice) {
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
      setErrorKey("invoice.linesRequired");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          invoiceDate,
          dueDate,
          paymentTermId: paymentTermId || null,
          currency: invoice.currency,
          notes: notes || null,
          terms: termsText || null,
          lines: payloadLines,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Insufficient stock") {
          setErrorKey("invoice.insufficientStock");
        } else if (data?.error === "Invalid customer") {
          setErrorKey("invoice.invalidCustomer");
        } else if (data?.error === "Invoice is locked") {
          setErrorKey("invoice.locked");
        } else if (data?.error === "VAT period is filed") {
          setErrorKey("vat.periodLocked");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      await loadInvoice();
    });
  };

  const handleApprove = () => {
    if (!invoice) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Invoice is locked") {
          setErrorKey("invoice.locked");
        } else if (data?.error === "VAT period is filed") {
          setErrorKey("vat.periodLocked");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      await loadInvoice();
      await loadPayments();
      await loadCreditNotes();
    });
  };

  const handleCancel = () => {
    if (!invoice) {
      return;
    }
    const confirmed = window.confirm(t("invoice.cancelConfirm"));
    if (!confirmed) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/invoices/${invoiceId}/cancel`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Invoice has payments") {
          setErrorKey("invoice.hasPayments");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      await loadInvoice();
      await loadPayments();
      await loadCreditNotes();
    });
  };

  const handleSend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invoice || !activeCompanyId) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          to: sendTo,
          subject: sendSubject,
          message: sendMessage,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Invoice must be approved") {
          setErrorKey("invoice.mustBeApproved");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      setNoticeKey("invoice.emailQueued");
      await loadInvoice();
    });
  };

  const handleRecordPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invoice || !activeCompanyId) {
      return;
    }
    const amountValue = paymentAmount.trim();
    const amount = amountValue ? Number(amountValue) : NaN;
    if (Number.isNaN(amount) || amount <= 0) {
      setErrorKey("invoice.invalidPaymentAmount");
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
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
        if (data?.error === "Amount exceeds balance") {
          setErrorKey("invoice.amountExceedsBalance");
        } else if (data?.error === "Invalid payment account") {
          setErrorKey("invoice.invalidPaymentAccount");
        } else if (data?.error === "Invoice is locked") {
          setErrorKey("invoice.locked");
        } else if (data?.error === "VAT period is filed") {
          setErrorKey("vat.periodLocked");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      setPaymentAmount("");
      setPaymentReference("");
      await loadInvoice();
      await loadPayments();
    });
  };

  const handleUploadAttachment = () => {
    if (!activeCompanyId || !attachmentFile || !invoice) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
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
            `companies/${activeCompanyId}/invoices/${invoiceId}`
          );
          payload.storage = "cloudinary";
          payload.url = url;
        } else {
          if (attachmentFile.size > FIRESTORE_ATTACHMENT_LIMIT) {
            setErrorKey("invoice.attachmentTooLarge");
            return;
          }
          const content = await readFileAsDataUrl(attachmentFile);
          payload.storage = "firestore";
          payload.content = content;
        }

        const response = await fetch(`/api/invoices/${invoiceId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data?.error === "Attachment too large") {
            setErrorKey("invoice.attachmentTooLarge");
          } else {
            setErrorKey("invoice.attachmentUploadFailed");
          }
          return;
        }
        setAttachmentFile(null);
        await loadAttachments();
      } catch {
        setErrorKey("invoice.attachmentUploadFailed");
      } finally {
        setIsUploading(false);
      }
    });
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    startTransition(async () => {
      await fetch(`/api/invoices/${invoiceId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      await loadAttachments();
    });
  };

  if (!invoice) {
    return (
      <section className="space-y-6 page-shell">
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
        <div className="app-card space-y-3 p-4 card-modern">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("invoice.detailsTitle")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold page-title">{invoice.invoiceNumber}</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                STATUS_STYLES[invoice.status]
              }`}
            >
              {t(`invoice.status.${invoice.status ?? "draft"}`)}
            </span>
          </div>
          <p className="text-sm text-muted page-subtitle">{invoice.customerName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/sales/invoices"
            className="text-xs font-semibold text-muted underline decoration-dotted"
          >
            {t("invoice.title")}
          </Link>
          <Link
            href={`/sales/invoices/${invoiceId}/print`}
            className="rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-semibold"
          >
            {t("invoice.print")}
          </Link>
          {invoice.status === "draft" ? (
            <button
              type="button"
              onClick={handleApprove}
              className="rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast"
              disabled={isPending}
            >
              {t("invoice.approve")}
            </button>
          ) : null}
          {["draft", "approved"].includes(invoice.status) ? (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold text-foreground"
              disabled={isPending}
            >
              {t("invoice.cancel")}
            </button>
          ) : null}
        </div>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {noticeKey ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t(noticeKey)}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="app-card p-6 lg:col-span-2 card-modern">
          <h2 className="text-lg font-semibold">{t("invoice.detailsSubtitle")}</h2>
          {isDraft ? (
            <form onSubmit={handleSave} className="mt-4 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.customer")}</span>
                  <select
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    required
                  >
                    <option value="">{t("invoice.selectCustomer")}</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("common.issueDate")}</span>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={invoiceDate}
                    onChange={(event) => setInvoiceDate(event.target.value)}
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
                  <span className="mb-1 block text-xs text-muted">{t("invoice.paymentTerm")}</span>
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

              <div>
                <h3 className="text-sm font-semibold">{t("invoice.linesTitle")}</h3>
                <div className="mt-3 space-y-3">
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
                      <div
                        key={line.id}
                        className="grid gap-3 rounded-2xl border border-border p-3 md:grid-cols-6"
                      >
                        <label className={`text-sm ${alignClass} md:col-span-2`}>
                          <span className="mb-1 block text-xs text-muted">{t("invoice.item")}</span>
                          <select
                            className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                            value={line.itemId}
                            onChange={(event) => handleItemSelect(index, event.target.value)}
                          >
                            <option value="">{t("invoice.selectItem")}</option>
                            {items.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
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
                            className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                            value={line.quantity}
                            onChange={(event) =>
                              handleLineChange(index, "quantity", event.target.value)
                            }
                          />
                        </label>
                        <label className={`text-sm ${alignClass}`}>
                          <span className="mb-1 block text-xs text-muted">{t("invoice.unit")}</span>
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
                          <span className="mb-1 block text-xs text-muted">{t("invoice.unitPrice")}</span>
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
                          <span className="mb-1 block text-xs text-muted">{t("invoice.discount")}</span>
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
                          <span className="mb-1 block text-xs text-muted">{t("invoice.taxCategory")}</span>
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
                            {t("invoice.lineTotal")}: {amounts.totalAmount.toFixed(2)}
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
                  className="mt-4 rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
                >
                  {t("invoice.addLine")}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
                  <textarea
                    className="min-h-[90px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.terms")}</span>
                  <textarea
                    className="min-h-[90px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={termsText}
                    onChange={(event) => setTermsText(event.target.value)}
                  />
                </label>
              </div>

              <button
                type="submit"
                className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
                disabled={isPending}
              >
                {t("invoice.updateDraft")}
              </button>
            </form>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted">{t("invoice.customer")}</p>
                  <p className="font-semibold">{invoice.customerName}</p>
                  {invoice.customerVatNumber ? (
                    <p className="text-xs text-muted">{invoice.customerVatNumber}</p>
                  ) : null}
                </div>
                <div className={alignClass}>
                  <p className="text-xs text-muted">{t("common.issueDate")}</p>
                  <p className="font-semibold">{formatDate(invoice.invoiceDate)}</p>
                  <p className="mt-2 text-xs text-muted">{t("common.dueDate")}</p>
                  <p className="font-semibold">{formatDate(invoice.dueDate)}</p>
                </div>
              </div>

              {invoice.billingAddress ? (
                <div className="rounded-2xl border border-border bg-surface p-4 text-xs text-muted">
                  {invoice.billingAddress}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm table-modern">
                  <thead className="bg-surface-muted text-muted thead-modern">
                    <tr>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.item")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.quantity")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.unitPrice")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.taxCategory")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoice.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <p className="font-semibold">{line.description}</p>
                        </td>
                        <td className="px-3 py-2">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="px-3 py-2">{formatCurrency(line.unitPrice)}</td>
                        <td className="px-3 py-2">
                          {line.taxRate ? `${(line.taxRate * 100).toFixed(1)}%` : "-"}
                        </td>
                        <td className="px-3 py-2">{formatCurrency(line.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invoice.notes ? (
                <div className="rounded-2xl border border-border bg-surface p-4 text-xs text-muted">
                  <p className="font-semibold text-foreground">{t("common.notes")}</p>
                  <p className="mt-2">{invoice.notes}</p>
                </div>
              ) : null}

              {invoice.terms ? (
                <div className="rounded-2xl border border-border bg-surface p-4 text-xs text-muted">
                  <p className="font-semibold text-foreground">{t("invoice.terms")}</p>
                  <p className="mt-2">{invoice.terms}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="app-card p-6 card-modern">
            <h3 className="text-sm font-semibold">{t("common.amount")}</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>{t("invoice.subtotal")}</span>
                <span>{formatCurrency(displayTotals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("invoice.discountTotal")}</span>
                <span>{formatCurrency(displayTotals.discountTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("invoice.taxTotal")}</span>
                <span>{formatCurrency(displayTotals.taxTotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                <span>{t("invoice.total")}</span>
                <span>{formatCurrency(displayTotals.total)}</span>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-surface-muted p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{t("invoice.amountPaid")}</span>
                <span>{formatCurrency(invoice.amountPaid)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>{t("invoice.amountCredited")}</span>
                <span>{formatCurrency(invoice.amountCredited)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between font-semibold">
                <span>{t("common.balance")}</span>
                <span>{formatCurrency(invoice.balance)}</span>
              </div>
            </div>
          </div>

          {invoice.status !== "draft" && invoice.status !== "canceled" ? (
            <div className="app-card p-6 card-modern">
              <h3 className="text-sm font-semibold">{t("invoice.sendTitle")}</h3>
              <p className="mt-1 text-xs text-muted">{t("invoice.sendSubtitle")}</p>
              <form onSubmit={handleSend} className="mt-4 space-y-3">
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.sendTo")}</span>
                  <input
                    type="email"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={sendTo}
                    onChange={(event) => setSendTo(event.target.value)}
                    required
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.sendSubject")}</span>
                  <input
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={sendSubject}
                    onChange={(event) => setSendSubject(event.target.value)}
                    required
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("invoice.sendMessage")}</span>
                  <textarea
                    className="min-h-[110px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={sendMessage}
                    onChange={(event) => setSendMessage(event.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
                  disabled={isPending}
                >
                  {t("invoice.sendButton")}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="app-card p-6 card-modern">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("invoice.paymentsTitle")}</h2>
            <span className="text-xs text-muted">{payments.length}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{t("invoice.paymentsSubtitle")}</p>

          {invoice.status !== "draft" && invoice.status !== "canceled" ? (
            <form onSubmit={handleRecordPayment} className="mt-4 grid gap-3 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("invoice.paymentDate")}</span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  required
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("invoice.paymentAmount")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  required
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("invoice.paymentMethod")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
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
                <span className="mb-1 block text-xs text-muted">{t("invoice.paymentAccount")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentAccountId}
                  onChange={(event) => setPaymentAccountId(event.target.value)}
                  required
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
                <span className="mb-1 block text-xs text-muted">{t("invoice.paymentReference")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast md:col-span-2"
                disabled={isPending}
              >
                {t("invoice.paymentRecord")}
              </button>
            </form>
          ) : null}

          {payments.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.paymentDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.paymentMethod")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.paymentAmount")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.paymentReference")}</th>
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
            <p className="mt-4 text-sm text-muted page-subtitle">{t("invoice.paymentsEmpty")}</p>
          )}
        </div>

        <div className="app-card p-6 card-modern">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("invoice.creditNotesTitle")}</h2>
            <Link
              href={`/sales/credit-notes/new?invoiceId=${invoiceId}`}
              className="text-xs font-semibold text-primary"
            >
              {t("invoice.createCreditNote")}
            </Link>
          </div>
          {creditNotes.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("creditNote.number")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("creditNote.issueDate")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.amount")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {creditNotes.map((note) => (
                    <tr key={note.id}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/sales/credit-notes/${note.id}`}
                          className="text-primary underline decoration-dotted"
                        >
                          {note.creditNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{formatDate(note.issueDate)}</td>
                      <td className="px-3 py-2">{formatCurrency(note.total, note.currency)}</td>
                      <td className="px-3 py-2">
                        {t(`creditNote.status.${note.status ?? "draft"}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted page-subtitle">{t("invoice.creditNotesEmpty")}</p>
          )}
        </div>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("invoice.attachmentsTitle")}</h2>
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
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-xs font-semibold"
            disabled={isPending || isUploading || !attachmentFile}
          >
            {isUploading ? t("invoice.uploading") : t("invoice.uploadAttachment")}
          </button>
          <p className="text-xs text-muted">{t("invoice.attachmentHint")}</p>
        </div>

        {attachments.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="text-xs text-muted">
                <tr>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("invoice.attachmentName")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("invoice.attachmentStorage")}</th>
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
                        ? t("documents.storage.cloudinary")
                        : t("documents.storage.firestore")}
                    </td>
                    <td className="px-2 py-2">{formatFileSize(attachment.size)}</td>
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
          <p className="mt-4 text-sm text-muted page-subtitle">{t("invoice.attachmentsEmpty")}</p>
        )}
      </div>
    </section>
  );
}
