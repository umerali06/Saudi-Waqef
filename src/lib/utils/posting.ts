import { roundMoney } from "@/lib/utils/invoice";
import type { PostingLine } from "@/lib/utils/journal";

export type PostingDocumentLine = {
  accountId: string;
  netAmount: number;
  discountAmount: number;
};

type PostingDocument = {
  lines: PostingDocumentLine[];
  discountTotal: number;
  taxTotal: number;
  total: number;
};

/** Amount per income or expense account, before the discount when that is posted on its own. */
function sumByAccount(lines: PostingDocumentLine[], separateDiscount: boolean) {
  const totals = new Map<string, number>();
  lines.forEach((line) => {
    const amount = line.netAmount + (separateDiscount ? line.discountAmount : 0);
    totals.set(line.accountId, (totals.get(line.accountId) ?? 0) + amount);
  });
  return Array.from(totals, ([accountId, amount]) => ({
    accountId,
    amount: roundMoney(amount),
  }));
}

const withoutZeroLines = (lines: PostingLine[]) =>
  lines.filter((line) => line.debit !== 0 || line.credit !== 0);

/** Debit receivable and discount, credit revenue and output VAT. */
export function buildSalesPosting(
  document: PostingDocument,
  accounts: {
    receivableId: string;
    vatOutputId: string | null;
    discountId: string | null;
  }
): PostingLine[] {
  const separateDiscount = Boolean(accounts.discountId) && document.discountTotal > 0;
  return withoutZeroLines([
    { accountId: accounts.receivableId, debit: document.total, credit: 0 },
    ...sumByAccount(document.lines, separateDiscount).map(({ accountId, amount }) => ({
      accountId,
      debit: 0,
      credit: amount,
    })),
    ...(separateDiscount && accounts.discountId
      ? [{ accountId: accounts.discountId, debit: document.discountTotal, credit: 0 }]
      : []),
    ...(accounts.vatOutputId
      ? [{ accountId: accounts.vatOutputId, debit: 0, credit: document.taxTotal }]
      : []),
  ]);
}

/** Debit expense and input VAT, credit discount and payable. */
export function buildPurchasePosting(
  document: PostingDocument,
  accounts: {
    payableId: string;
    vatInputId: string | null;
    discountId: string | null;
  }
): PostingLine[] {
  const separateDiscount = Boolean(accounts.discountId) && document.discountTotal > 0;
  return withoutZeroLines([
    ...sumByAccount(document.lines, separateDiscount).map(({ accountId, amount }) => ({
      accountId,
      debit: amount,
      credit: 0,
    })),
    ...(separateDiscount && accounts.discountId
      ? [{ accountId: accounts.discountId, debit: 0, credit: document.discountTotal }]
      : []),
    ...(accounts.vatInputId
      ? [{ accountId: accounts.vatInputId, debit: document.taxTotal, credit: 0 }]
      : []),
    { accountId: accounts.payableId, debit: 0, credit: document.total },
  ]);
}
