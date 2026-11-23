import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type RecurringStatus = "active" | "paused";
export type RecurringFrequency = "weekly" | "monthly";

export type RecurringInvoice = {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  currency: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  /** Day of the month a monthly schedule runs on. */
  anchorDay: number;
  lastRunDate?: string | null;
  status: RecurringStatus;
  template: {
    invoiceDateOffsetDays: number;
    dueDays: number;
    paymentTermId?: string | null;
    notes?: string | null;
    terms?: string | null;
    lines: Array<{
      id: string;
      itemId: string;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      discountRate?: number;
      taxCategoryId?: string | null;
    }>;
  };
  createdAt: Date;
};

const dayOf = (date: string) => Number(date.slice(8, 10));

function mapRecurringInvoice(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    customerId: data.customerId,
    customerName: data.customerName,
    currency: data.currency ?? "SAR",
    frequency: data.frequency ?? "monthly",
    nextRunDate: data.nextRunDate,
    anchorDay: data.anchorDay ?? dayOf(data.nextRunDate),
    lastRunDate: data.lastRunDate ?? null,
    status: data.status ?? "active",
    template: data.template,
    createdAt: data.createdAt.toDate(),
  } as RecurringInvoice;
}

export async function listRecurringInvoices(companyId: string) {
  const snapshot = await db
    .collection("recurring_invoices")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapRecurringInvoice);
}

/** Companies that have at least one schedule due on or before the date. */
export async function listCompaniesWithDueSchedules(date: string) {
  const snapshot = await db
    .collection("recurring_invoices")
    .where("status", "==", "active")
    .get();

  return Array.from(
    new Set(
      snapshot.docs
        .map(mapRecurringInvoice)
        .filter((schedule) => schedule.nextRunDate <= date)
        .map((schedule) => schedule.companyId)
    )
  );
}

export async function getRecurringInvoice(id: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("recurring_invoices").doc(id), tx);
  return doc.exists ? mapRecurringInvoice(doc) : null;
}

export async function createRecurringInvoice(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  currency?: string | null;
  frequency: RecurringFrequency;
  nextRunDate: string;
  template: RecurringInvoice["template"];
}) {
  const id = uuidv4();
  await db.collection("recurring_invoices").doc(id).set({
    companyId: params.companyId,
    customerId: params.customerId,
    customerName: params.customerName,
    currency: params.currency ?? "SAR",
    frequency: params.frequency,
    nextRunDate: params.nextRunDate,
    anchorDay: dayOf(params.nextRunDate),
    lastRunDate: null,
    status: "active",
    template: params.template,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateRecurringInvoice(
  id: string,
  updates: Partial<{
    status: RecurringStatus;
    nextRunDate: string;
    anchorDay: number;
    lastRunDate: string | null;
    frequency: RecurringFrequency;
    template: RecurringInvoice["template"];
  }>,
  tx?: Transaction
) {
  await writeDoc(
    db.collection("recurring_invoices").doc(id),
    { ...updates, updatedAt: Timestamp.now() },
    { merge: true, tx }
  );
}

export async function deleteRecurringInvoice(id: string) {
  await db.collection("recurring_invoices").doc(id).delete();
}
