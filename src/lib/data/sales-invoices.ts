import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

export type InvoiceStatus =
  | "draft"
  | "approved"
  | "sent"
  | "partially_paid"
  | "paid"
  | "canceled";

export type InvoiceLine = {
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

export type SalesInvoice = {
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
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  invoicePrefix: "INV-",
  invoiceSuffix: "",
  invoiceNextNumber: 1,
  invoicePadding: 0,
  invoiceResetYearly: false,
  invoiceLastResetYear: null as number | null,
};

export async function listSalesInvoices(companyId: string) {
  const snapshot = await db
    .collection("sales_invoices")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      customerId: data.customerId,
      customerName: data.customerName,
      customerVatNumber: data.customerVatNumber ?? undefined,
      billingAddress: data.billingAddress ?? undefined,
      invoiceNumber: data.invoiceNumber,
      status: data.status,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      currency: data.currency ?? "SAR",
      paymentTermId: data.paymentTermId ?? null,
      notes: data.notes ?? null,
      terms: data.terms ?? null,
      subtotal: data.subtotal ?? 0,
      discountTotal: data.discountTotal ?? 0,
      taxTotal: data.taxTotal ?? 0,
      total: data.total ?? 0,
      amountPaid: data.amountPaid ?? 0,
      amountCredited: data.amountCredited ?? 0,
      balance: data.balance ?? 0,
      lines: data.lines ?? [],
      openItemId: data.openItemId ?? null,
      journalEntryId: data.journalEntryId ?? null,
      sentAt: data.sentAt ?? null,
      sentTo: data.sentTo ?? null,
      approvedAt: data.approvedAt ?? null,
      createdAt: data.createdAt.toDate(),
    } as SalesInvoice;
  });
}

export async function getSalesInvoiceById(invoiceId: string) {
  const doc = await db.collection("sales_invoices").doc(invoiceId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    customerId: data.customerId,
    customerName: data.customerName,
    customerVatNumber: data.customerVatNumber ?? undefined,
    billingAddress: data.billingAddress ?? undefined,
    invoiceNumber: data.invoiceNumber,
    status: data.status,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    currency: data.currency ?? "SAR",
    paymentTermId: data.paymentTermId ?? null,
    notes: data.notes ?? null,
    terms: data.terms ?? null,
    subtotal: data.subtotal ?? 0,
    discountTotal: data.discountTotal ?? 0,
    taxTotal: data.taxTotal ?? 0,
    total: data.total ?? 0,
    amountPaid: data.amountPaid ?? 0,
    amountCredited: data.amountCredited ?? 0,
    balance: data.balance ?? 0,
    lines: data.lines ?? [],
    openItemId: data.openItemId ?? null,
    journalEntryId: data.journalEntryId ?? null,
    sentAt: data.sentAt ?? null,
    sentTo: data.sentTo ?? null,
    approvedAt: data.approvedAt ?? null,
    createdAt: data.createdAt.toDate(),
  } as SalesInvoice;
}

export async function createSalesInvoice(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  customerVatNumber?: string | null;
  billingAddress?: string | null;
  invoiceDate: string;
  dueDate: string;
  currency?: string | null;
  paymentTermId?: string | null;
  notes?: string | null;
  terms?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  amountCredited?: number;
  balance?: number;
  status?: InvoiceStatus;
  lines: InvoiceLine[];
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const invoiceRef = db.collection("sales_invoices").doc(id);

  let invoiceNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.data() ?? {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.invoicePrefix === "string"
          ? config.invoicePrefix
          : DEFAULT_CONFIG.invoicePrefix,
      suffix:
        typeof config.invoiceSuffix === "string"
          ? config.invoiceSuffix
          : DEFAULT_CONFIG.invoiceSuffix,
      nextNumber:
        typeof config.invoiceNextNumber === "number"
          ? config.invoiceNextNumber
          : DEFAULT_CONFIG.invoiceNextNumber,
      padding:
        typeof config.invoicePadding === "number"
          ? config.invoicePadding
          : DEFAULT_CONFIG.invoicePadding,
      resetYearly:
        typeof config.invoiceResetYearly === "boolean"
          ? config.invoiceResetYearly
          : DEFAULT_CONFIG.invoiceResetYearly,
      lastResetYear:
        typeof config.invoiceLastResetYear === "number"
          ? config.invoiceLastResetYear
          : DEFAULT_CONFIG.invoiceLastResetYear,
      date: params.invoiceDate,
    });
    invoiceNumber = sequence.number;

    tx.set(invoiceRef, {
      companyId: params.companyId,
      customerId: params.customerId,
      customerName: params.customerName,
      customerNameNormalized: normalizeSearch(params.customerName),
      customerVatNumber: params.customerVatNumber ?? null,
      billingAddress: params.billingAddress ?? null,
      invoiceNumber,
      invoiceNumberNormalized: normalizeSearch(invoiceNumber),
      status: params.status ?? "draft",
      invoiceDate: params.invoiceDate,
      dueDate: params.dueDate,
      currency: params.currency ?? "SAR",
      paymentTermId: params.paymentTermId ?? null,
      notes: params.notes ?? null,
      terms: params.terms ?? null,
      subtotal: params.subtotal,
      discountTotal: params.discountTotal,
      taxTotal: params.taxTotal,
      total: params.total,
      amountPaid: params.amountPaid ?? 0,
      amountCredited: params.amountCredited ?? 0,
      balance: params.balance ?? params.total,
      lines: params.lines,
      createdAt: Timestamp.now(),
    });

    tx.set(
      configRef,
      {
        invoiceNextNumber: sequence.nextNumber,
        invoiceLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

  return { id, invoiceNumber };
}

export async function updateSalesInvoice(
  invoiceId: string,
  updates: Partial<{
    customerId: string;
    customerName: string;
    customerVatNumber: string | null;
    billingAddress: string | null;
    invoiceDate: string;
    dueDate: string;
    currency: string | null;
    paymentTermId: string | null;
    notes: string | null;
    terms: string | null;
    status: InvoiceStatus;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    amountPaid: number;
    amountCredited: number;
    balance: number;
    lines: InvoiceLine[];
    openItemId: string | null;
    journalEntryId: string | null;
    sentAt: string | null;
    sentTo: string | null;
    approvedAt: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.customerName) {
    payload.customerNameNormalized = normalizeSearch(updates.customerName);
  }
  await db.collection("sales_invoices").doc(invoiceId).set(payload, { merge: true });
}
