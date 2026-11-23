import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

type Data = Record<string, unknown>;

/** In-memory Firestore that enforces the rules transactions and writes have. */
const { db, store } = vi.hoisted(() => {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const table = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const checkDefined = (value: unknown, path: string) => {
    if (value === undefined) throw new Error(`undefined written to ${path}`);
    if (Array.isArray(value)) value.forEach((item, i) => checkDefined(item, `${path}[${i}]`));
    else if (value && typeof value === "object" && value.constructor === Object) {
      Object.entries(value).forEach(([key, item]) => checkDefined(item, `${path}.${key}`));
    }
  };
  const snapshot = (name: string, id: string, ref: unknown) => {
    const data = table(name).get(id);
    return { id, ref, exists: Boolean(data), data: () => data };
  };
  const makeRef = (name: string, id: string) => {
    const ref = {
      name,
      id,
      get: async () => snapshot(name, id, ref),
      set: async (data: Record<string, unknown>, options?: { merge?: boolean }) =>
        write(name, id, data, options),
      delete: async () => void table(name).delete(id),
    };
    return ref;
  };
  const write = (
    name: string,
    id: string,
    data: Record<string, unknown>,
    options?: { merge?: boolean }
  ) => {
    checkDefined(data, `${name}/${id}`);
    const previous = options?.merge ? table(name).get(id) ?? {} : {};
    const next: Record<string, unknown> = { ...previous };
    Object.entries(data).forEach(([key, value]) => {
      const operand = (value as { operand?: number } | null)?.operand;
      next[key] = typeof operand === "number" ? Number(previous[key] ?? 0) + operand : value;
    });
    table(name).set(id, next);
  };
  const makeQuery = (name: string, filters: Array<[string, unknown]>, max = Infinity) => ({
    where: (field: string, _: string, value: unknown) =>
      makeQuery(name, [...filters, [field, value]], max),
    limit: (count: number) => makeQuery(name, filters, count),
    get: async () => {
      const docs = [...table(name).entries()]
        .filter(([, data]) => filters.every(([field, value]) => data[field] === value))
        .slice(0, max)
        .map(([id]) => snapshot(name, id, makeRef(name, id)));
      return { docs, empty: docs.length === 0 };
    },
  });
  const db = {
    collection: (name: string) => ({
      ...makeQuery(name, []),
      doc: (id = Math.random().toString(36).slice(2)) => makeRef(name, id),
    }),
    runTransaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const result = await run({
        get: (target: { get: () => Promise<unknown> }) => {
          if (writes.length > 0) throw new Error("read after write in transaction");
          return target.get();
        },
        set: (
          ref: { name: string; id: string },
          data: Record<string, unknown>,
          options?: { merge?: boolean }
        ) => {
          checkDefined(data, `${ref.name}/${ref.id}`);
          writes.push(() => write(ref.name, ref.id, data, options));
        },
        delete: (ref: { name: string; id: string }) =>
          writes.push(() => void table(ref.name).delete(ref.id)),
      });
      writes.forEach((apply) => apply());
      return result;
    },
  };
  return { db, store };
});
vi.mock("@/lib/firebase/admin", () => ({ db }));

import { applyCredit } from "@/lib/accounting/credits";
import { payInvoice, readPayableInvoices } from "@/lib/accounting/payments";
import { approvePurchaseBill, issueVendorCreditNote } from "@/lib/accounting/purchases";
import { runRecurringInvoices } from "@/lib/accounting/recurring";
import {
  approveSalesInvoice,
  cancelSalesInvoice,
  issueSalesCreditNote,
  issueSalesDebitNote,
} from "@/lib/accounting/sales";
import { createJournalEntry, updateJournalEntry } from "@/lib/data/journal-entries";
import { openingEntryId, saveOpeningBalances } from "@/lib/data/opening-balances";
import { createPurchaseBill, getPurchaseBillById } from "@/lib/data/purchase-bills";
import { createSalesInvoice, getSalesInvoiceById } from "@/lib/data/sales-invoices";

const rows = (name: string) =>
  [...(store.get(name) ?? new Map<string, Data>()).entries()].map(([id, data]) => ({
    ...(data as Data),
    id,
  })) as Array<Data & { id: string }>;
const put = (name: string, id: string, data: Data) => {
  if (!store.has(name)) store.set(name, new Map());
  store.get(name)!.set(id, data);
};

const line = {
  id: "line-1",
  itemId: "item",
  description: "Item",
  quantity: 10,
  unit: "unit",
  unitPrice: 100,
  discountRate: 0,
  discountAmount: 0,
  taxCategoryId: "vat",
  taxRate: 0.15,
  netAmount: 1000,
  taxAmount: 150,
  totalAmount: 1150,
  baseQuantity: 10,
};
const totals = { subtotal: 1000, discountTotal: 0, taxTotal: 150, total: 1150 };

let companyId = "";
let counter = 0;

beforeEach(() => {
  store.clear();
  counter += 1;
  companyId = `company-${counter}`;
  const createdAt = Timestamp.now();
  for (const id of ["ar", "ap", "sales", "services", "purchases", "vatOut", "vatIn", "bank"]) {
    put("chart_accounts", id, { companyId, code: id, name: id, isPosting: true, createdAt });
  }
  put("company_defaults", companyId, {
    receivableAccountId: "ar",
    payableAccountId: "ap",
    salesAccountId: "sales",
    purchasesAccountId: "purchases",
    vatOutputAccountId: "vatOut",
    vatInputAccountId: "vatIn",
  });
  put("items", "item", {
    companyId,
    name: "Item",
    baseUnit: "unit",
    incomeAccountId: "services",
    trackInventory: true,
    stockOnHand: 50,
    stockReserved: 10,
    createdAt,
  });
});

async function draftInvoice() {
  const { id } = await createSalesInvoice({
    companyId,
    customerId: "customer",
    customerName: "Customer",
    invoiceDate: "2026-01-10",
    dueDate: "2026-02-10",
    ...totals,
    lines: [line],
  });
  return (await getSalesInvoiceById(id))!;
}

async function approvedInvoice() {
  const invoice = await draftInvoice();
  await approveSalesInvoice(invoice);
  return (await getSalesInvoiceById(invoice.id))!;
}

const pay = (invoiceId: string, amount: number) =>
  db.runTransaction(async (tx) => {
    const [{ invoice }] = await readPayableInvoices(tx as never, {
      companyId,
      allocations: [{ invoiceId, amount }],
    });
    return payInvoice(tx as never, invoice, {
      amount,
      paymentDate: "2026-01-20",
      method: "cash",
      accountId: "bank",
    });
  });

describe("sales invoices", () => {
  it("posts once, to the item's income account, and moves stock", async () => {
    const invoice = await draftInvoice();
    await approveSalesInvoice(invoice);
    await expect(approveSalesInvoice(invoice)).rejects.toThrow("Invoice is locked");

    expect(rows("journal_entries")).toHaveLength(1);
    expect(rows("journal_entries")[0].lines).toEqual([
      { accountId: "ar", debit: 1150, credit: 0 },
      { accountId: "services", debit: 0, credit: 1000 },
      { accountId: "vatOut", debit: 0, credit: 150 },
    ]);
    expect(store.get("items")!.get("item")).toMatchObject({ stockOnHand: 40, stockReserved: 0 });
  });

  it("cancels by reversing the entry that was posted, whatever the defaults are now", async () => {
    const invoice = await approvedInvoice();
    put("company_defaults", companyId, {});
    await cancelSalesInvoice(invoice.id);

    const reversal = rows("journal_entries").find(
      (entry) => entry.sourceType === "sales_invoice_cancel"
    );
    expect(reversal).toMatchObject({
      reversalOf: invoice.journalEntryId,
      lines: [
        { accountId: "ar", debit: 0, credit: 1150 },
        { accountId: "services", debit: 1000, credit: 0 },
        { accountId: "vatOut", debit: 150, credit: 0 },
      ],
    });
    expect(store.get("items")!.get("item")).toMatchObject({ stockOnHand: 50 });
    expect(rows("open_items")).toHaveLength(0);
  });

  it("gives two invoices different numbers even when the counter went back", async () => {
    const first = await draftInvoice();
    put("company_configs", companyId, { invoiceNextNumber: 1 });
    const second = await draftInvoice();
    expect(first.invoiceNumber).toBe("INV-1");
    expect(second.invoiceNumber).toBe("INV-2");
  });
});

describe("notes", () => {
  const noteLine = { ...line, quantity: 5, netAmount: 500, taxAmount: 75, totalAmount: 575 };

  it("keeps a debit note owed through a later payment and blocks cancel", async () => {
    const invoice = await approvedInvoice();
    await issueSalesDebitNote({
      companyId,
      create: {
        companyId,
        invoiceId: invoice.id,
        issueDate: "2026-01-12",
        lines: [{ ...line, restock: false, netAmount: 100, taxAmount: 15, totalAmount: 115 }],
      },
    });
    await expect(cancelSalesInvoice(invoice.id)).rejects.toThrow("Invoice has allocations");
    await pay(invoice.id, 1200);
    expect(await getSalesInvoiceById(invoice.id)).toMatchObject({
      balance: 65,
      status: "partially_paid",
    });
  });

  it("credits a paid invoice and applies the credit to another", async () => {
    const paid = await approvedInvoice();
    await pay(paid.id, 1150);
    const note = await issueSalesCreditNote({
      companyId,
      create: {
        companyId,
        invoiceId: paid.id,
        issueDate: "2026-01-25",
        lines: [{ ...noteLine, restock: true, baseQuantity: 5 }],
      },
    });
    const credit = rows("open_items").find((item) => item.docType === "credit_note_credit")!;
    expect(credit).toMatchObject({ balance: -575, sourceId: note.id });
    expect(await getSalesInvoiceById(paid.id)).toMatchObject({
      balance: 0,
      status: "paid",
      creditNotesTotal: 575,
    });

    const other = await approvedInvoice();
    await applyCredit({
      openItemId: credit.id,
      companyId,
      allocations: [{ documentId: other.id, amount: 575 }],
    });
    expect(await getSalesInvoiceById(other.id)).toMatchObject({
      balance: 575,
      status: "partially_paid",
    });
    expect(store.get("open_items")!.get(credit.id)).toMatchObject({ balance: 0 });
    await expect(
      applyCredit({
        openItemId: credit.id,
        companyId,
        allocations: [{ documentId: other.id, amount: 1 }],
      })
    ).rejects.toThrow("Amount exceeds credit");
  });

  it("leaves nothing behind when a note cannot be posted", async () => {
    const draft = await draftInvoice();
    const create = {
      companyId,
      invoiceId: draft.id,
      issueDate: "2026-01-25",
      lines: [{ ...noteLine, restock: false }],
    };
    await expect(issueSalesCreditNote({ companyId, create })).rejects.toThrow(
      "Invoice is not approved"
    );
    const invoice = await approvedInvoice();
    await expect(
      issueSalesCreditNote({
        companyId,
        create: { ...create, invoiceId: invoice.id, lines: [{ ...line, totalAmount: 2300, netAmount: 2000, taxAmount: 300, restock: false }] },
      })
    ).rejects.toThrow("Credit exceeds balance");
    expect(rows("sales_credit_notes")).toHaveLength(0);
  });
});

describe("purchases", () => {
  it("turns a credit on a paid bill into a vendor credit", async () => {
    const { id } = await createPurchaseBill({
      companyId,
      vendorId: "vendor",
      vendorName: "Vendor",
      billDate: "2026-01-10",
      dueDate: "2026-02-10",
      ...totals,
      lines: [line],
    });
    await approvePurchaseBill((await getPurchaseBillById(id))!);
    store.get("purchase_bills")!.set(id, {
      ...store.get("purchase_bills")!.get(id)!,
      amountPaid: 1150,
      balance: 0,
      status: "paid",
    });
    await issueVendorCreditNote({
      companyId,
      create: {
        billId: id,
        issueDate: "2026-01-20",
        lines: [{ ...line, returnToVendor: true }],
      },
    });
    expect(rows("open_items").find((item) => item.docType === "vendor_credit_note_credit"))
      .toMatchObject({ balance: -1150 });
    expect(store.get("items")!.get("item")).toMatchObject({ stockOnHand: 50 });
  });
});

describe("recurring invoices", () => {
  it("catches up missed runs once and reports what it could not invoice", async () => {
    const createdAt = Timestamp.now();
    put("customers", "customer", { companyId, name: "Customer", status: "active", createdAt });
    put("items", "item", { ...store.get("items")!.get("item")!, stockReserved: 0, stockOnHand: 5 });
    put("recurring_invoices", "schedule", {
      companyId,
      customerId: "customer",
      customerName: "Customer",
      frequency: "monthly",
      nextRunDate: "2026-01-31",
      status: "active",
      createdAt,
      template: {
        invoiceDateOffsetDays: 0,
        dueDays: 30,
        lines: [
          { id: "l", itemId: "item", description: "Item", quantity: 2, unit: "unit", unitPrice: 10 },
        ],
      },
    });

    const result = await runRecurringInvoices(companyId, "2026-04-01");
    expect(result.created).toHaveLength(2);
    expect(result.failed).toEqual([
      { recurringId: "schedule", customerName: "Customer", reason: "INSUFFICIENT_STOCK" },
    ]);
    expect(rows("sales_invoices").map((invoice) => invoice.invoiceDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
    ]);
    expect(store.get("recurring_invoices")!.get("schedule")).toMatchObject({
      nextRunDate: "2026-03-31",
      anchorDay: 31,
    });
  });
});

describe("journal entries", () => {
  it("rejects unbalanced lines", async () => {
    await expect(
      createJournalEntry({
        companyId,
        sourceType: "manual",
        date: "2026-01-01",
        lines: [{ accountId: "bank", debit: 10, credit: 0 }],
      })
    ).rejects.toThrow("Unbalanced");
  });

  it("updates only the given fields", async () => {
    const id = await createJournalEntry({
      companyId,
      sourceType: "manual",
      date: "2026-01-01",
      status: "draft",
      lines: [
        { accountId: "bank", debit: 10, credit: 0 },
        { accountId: "sales", debit: 0, credit: 10 },
      ],
    });
    await updateJournalEntry(id, { status: "posted", approvedAt: new Date() });
    expect(store.get("journal_entries")!.get(id)).toMatchObject({
      status: "posted",
      date: "2026-01-01",
    });
  });

  it("keeps opening balances in a single entry", async () => {
    const save = (amount: number) =>
      saveOpeningBalances(
        companyId,
        [
          { accountId: "bank", debit: amount, credit: 0 },
          { accountId: "sales", debit: 0, credit: amount },
          { accountId: "ar", debit: 0, credit: 0 },
        ],
        "2026-01-01",
        "user"
      );
    await save(100);
    await save(250);
    expect(rows("journal_entries")).toHaveLength(1);
    expect(store.get("journal_entries")!.get(openingEntryId(companyId))).toMatchObject({
      sourceType: "opening_balance",
      totalDebit: 250,
    });
    await save(0);
    expect(rows("journal_entries")).toHaveLength(0);
  });
});

it("uses increments the fake understands", () => {
  expect((FieldValue.increment(2) as unknown as { operand: number }).operand).toBe(2);
});
