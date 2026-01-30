import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

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

export async function listRecurringInvoices(companyId: string) {
  const snapshot = await db
    .collection("recurring_invoices")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      customerId: data.customerId,
      customerName: data.customerName,
      currency: data.currency ?? "SAR",
      frequency: data.frequency ?? "monthly",
      nextRunDate: data.nextRunDate,
      lastRunDate: data.lastRunDate ?? null,
      status: data.status ?? "active",
      template: data.template,
      createdAt: data.createdAt.toDate(),
    } as RecurringInvoice;
  });
}

export async function getRecurringInvoice(id: string) {
  const doc = await db.collection("recurring_invoices").doc(id).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    customerId: data.customerId,
    customerName: data.customerName,
    currency: data.currency ?? "SAR",
    frequency: data.frequency ?? "monthly",
    nextRunDate: data.nextRunDate,
    lastRunDate: data.lastRunDate ?? null,
    status: data.status ?? "active",
    template: data.template,
    createdAt: data.createdAt.toDate(),
  } as RecurringInvoice;
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
    lastRunDate: string | null;
    frequency: RecurringFrequency;
    template: RecurringInvoice["template"];
  }>
) {
  await db.collection("recurring_invoices").doc(id).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function deleteRecurringInvoice(id: string) {
  await db.collection("recurring_invoices").doc(id).delete();
}
