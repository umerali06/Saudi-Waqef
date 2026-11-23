import type { Transaction } from "firebase-admin/firestore";
import { PostingError } from "@/lib/accounting/errors";
import { createBillPayment } from "@/lib/data/bill-payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createInvoicePayment } from "@/lib/data/invoice-payments";
import { updateOpenItemBalance } from "@/lib/data/open-items";
import {
  getPurchaseBillById,
  updatePurchaseBill,
  type PurchaseBill,
} from "@/lib/data/purchase-bills";
import {
  getSalesInvoiceById,
  updateSalesInvoice,
  type SalesInvoice,
} from "@/lib/data/sales-invoices";
import { roundMoney } from "@/lib/utils/invoice";
import { exceedsBalance, outstandingBalance, settlementStatus } from "@/lib/utils/settlement";

type PaymentDetails = {
  id?: string;
  amount: number;
  paymentDate: string;
  method: string;
  reference?: string | null;
  accountId: string;
  journalEntryId?: string | null;
};

/** Checks the cash account and returns the receivable or payable account to settle. */
export async function loadSettlementAccount(
  companyId: string,
  side: "receivable" | "payable",
  paymentAccountId: string
) {
  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(companyId),
    listChartAccounts(companyId),
  ]);
  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(paymentAccountId)) {
    throw new PostingError("Invalid payment account");
  }
  const accountId =
    side === "receivable" ? defaults.receivableAccountId : defaults.payableAccountId;
  if (!accountId || !accountIds.has(accountId)) {
    throw new PostingError(`Missing ${side} account`);
  }
  return accountId;
}

/** A repeated request must describe the same payment it was first sent for. */
export function assertSameRequest(
  existing: { companyId: string; amount: number },
  request: { companyId: string; amount: number }
) {
  if (
    existing.companyId !== request.companyId ||
    roundMoney(existing.amount) !== roundMoney(request.amount)
  ) {
    throw new PostingError("DUPLICATE_REQUEST", 409);
  }
}

/** Reads the invoices of an allocation and checks each can take its amount. */
export async function readPayableInvoices(
  tx: Transaction,
  params: {
    companyId: string;
    customerId?: string;
    allocations: Array<{ invoiceId: string; amount: number }>;
  }
) {
  const amounts = new Map<string, number>();
  params.allocations.forEach((allocation) => {
    amounts.set(
      allocation.invoiceId,
      roundMoney((amounts.get(allocation.invoiceId) ?? 0) + allocation.amount)
    );
  });
  const result: Array<{ invoice: SalesInvoice; amount: number }> = [];
  for (const [invoiceId, amount] of amounts) {
    const invoice = await getSalesInvoiceById(invoiceId, tx);
    if (
      !invoice ||
      invoice.companyId !== params.companyId ||
      (params.customerId && invoice.customerId !== params.customerId)
    ) {
      throw new PostingError("Invalid invoice");
    }
    if (["draft", "canceled"].includes(invoice.status)) {
      throw new PostingError("Invoice is locked");
    }
    if (exceedsBalance(amount, outstandingBalance(invoice))) {
      throw new PostingError("Amount exceeds balance");
    }
    result.push({ invoice, amount });
  }
  return result;
}

export async function readPayableBills(
  tx: Transaction,
  params: {
    companyId: string;
    vendorId?: string;
    allocations: Array<{ billId: string; amount: number }>;
  }
) {
  const amounts = new Map<string, number>();
  params.allocations.forEach((allocation) => {
    amounts.set(
      allocation.billId,
      roundMoney((amounts.get(allocation.billId) ?? 0) + allocation.amount)
    );
  });
  const result: Array<{ bill: PurchaseBill; amount: number }> = [];
  for (const [billId, amount] of amounts) {
    const bill = await getPurchaseBillById(billId, tx);
    if (
      !bill ||
      bill.companyId !== params.companyId ||
      (params.vendorId && bill.vendorId !== params.vendorId)
    ) {
      throw new PostingError("Invalid bill");
    }
    if (["draft", "canceled"].includes(bill.status)) {
      throw new PostingError("Bill is locked");
    }
    if (exceedsBalance(amount, outstandingBalance(bill))) {
      throw new PostingError("Amount exceeds balance");
    }
    result.push({ bill, amount });
  }
  return result;
}

/** Records a payment on an invoice read in the same transaction. */
export async function payInvoice(
  tx: Transaction,
  invoice: SalesInvoice,
  payment: PaymentDetails
) {
  const amounts = {
    ...invoice,
    amountPaid: roundMoney(invoice.amountPaid + payment.amount),
  };
  const balance = outstandingBalance(amounts);
  const status = settlementStatus(amounts, invoice.status);
  await updateSalesInvoice(
    invoice.id,
    {
      amountPaid: amounts.amountPaid,
      amountDebited: invoice.amountDebited,
      balance,
      status,
    },
    tx
  );
  const paymentId = await createInvoicePayment(
    { ...payment, companyId: invoice.companyId, invoiceId: invoice.id },
    tx
  );
  if (invoice.openItemId) {
    await updateOpenItemBalance(invoice.openItemId, balance, tx);
  }
  return { paymentId, status };
}

/** Records a payment on a bill read in the same transaction. */
export async function payBill(tx: Transaction, bill: PurchaseBill, payment: PaymentDetails) {
  const amounts = {
    ...bill,
    amountPaid: roundMoney(bill.amountPaid + payment.amount),
  };
  const balance = outstandingBalance(amounts);
  const status = settlementStatus(amounts, bill.status);
  await updatePurchaseBill(bill.id, { amountPaid: amounts.amountPaid, balance, status }, tx);
  const paymentId = await createBillPayment(
    { ...payment, companyId: bill.companyId, billId: bill.id },
    tx
  );
  if (bill.openItemId) {
    await updateOpenItemBalance(bill.openItemId, balance, tx);
  }
  return { paymentId, status };
}
