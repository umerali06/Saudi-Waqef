import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc, writeDoc } from "@/lib/firebase/documents";
import { deriveAmountDebited } from "@/lib/utils/settlement";

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
  /** Total of issued credit notes, including the part that became a credit. */
  creditNotesTotal: number;
  /** Total of issued debit notes. */
  amountDebited: number;
  balance: number;
  lines: InvoiceLine[];
  openItemId?: string | null;
  journalEntryId?: string | null;
  sentAt?: string | null;
  sentTo?: string | null;
  lastReminderAt?: string | null;
  approvedAt?: string | null;
  createdAt: Date;
};

function mapSalesInvoice(doc: DocumentSnapshot) {
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
    creditNotesTotal: data.creditNotesTotal ?? data.amountCredited ?? 0,
    amountDebited: deriveAmountDebited({
      stored: data.amountDebited,
      status: data.status,
      total: data.total ?? 0,
      amountPaid: data.amountPaid ?? 0,
      amountCredited: data.amountCredited ?? 0,
      balance: data.balance ?? 0,
    }),
    balance: data.balance ?? 0,
    lines: data.lines ?? [],
    openItemId: data.openItemId ?? null,
    journalEntryId: data.journalEntryId ?? null,
    sentAt: data.sentAt ?? null,
    sentTo: data.sentTo ?? null,
    lastReminderAt: data.lastReminderAt ?? null,
    approvedAt: data.approvedAt ?? null,
    createdAt: data.createdAt.toDate(),
  } as SalesInvoice;
}

export async function listSalesInvoices(companyId: string) {
  const snapshot = await db
    .collection("sales_invoices")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapSalesInvoice);
}

export async function getSalesInvoiceById(invoiceId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("sales_invoices").doc(invoiceId), tx);
  return doc.exists ? mapSalesInvoice(doc) : null;
}

export async function createSalesInvoice(params: {
  id?: string;
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
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const invoiceRef = db.collection("sales_invoices").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "invoice",
      defaultPrefix: "INV-",
      collection: "sales_invoices",
      field: "invoiceNumber",
      date: params.invoiceDate,
    });
    const invoiceNumber = sequence.number;

    transaction.set(invoiceRef, {
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
      creditNotesTotal: 0,
      amountDebited: 0,
      balance: params.balance ?? params.total,
      lines: params.lines,
      createdAt: Timestamp.now(),
    });

    sequence.save();
    return invoiceNumber;
  };

  const invoiceNumber = tx ? await create(tx) : await db.runTransaction(create);
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
    creditNotesTotal: number;
    amountDebited: number;
    balance: number;
    lines: InvoiceLine[];
    openItemId: string | null;
    journalEntryId: string | null;
    cancelJournalEntryId: string | null;
    sentAt: string | null;
    sentTo: string | null;
    lastReminderAt: string | null;
    approvedAt: string | null;
  }>,
  tx?: Transaction
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.customerName) {
    payload.customerNameNormalized = normalizeSearch(updates.customerName);
  }
  await writeDoc(db.collection("sales_invoices").doc(invoiceId), payload, { merge: true, tx });
}
