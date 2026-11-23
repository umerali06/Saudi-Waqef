import { roundMoney } from "@/lib/utils/invoice";

export type SettlementAmounts = {
  total: number;
  amountPaid: number;
  /** Credit applied against this document's balance. */
  amountCredited: number;
  /** Debit notes added to this document. */
  amountDebited?: number;
};

/** What is still owed on an invoice or bill. */
export function outstandingBalance(amounts: SettlementAmounts) {
  return Math.max(
    roundMoney(
      amounts.total +
        (amounts.amountDebited ?? 0) -
        amounts.amountPaid -
        amounts.amountCredited
    ),
    0
  );
}

export function exceedsBalance(amount: number, balance: number) {
  return roundMoney(amount) > roundMoney(balance);
}

/** Status after a payment, credit or debit changed the balance. */
export function settlementStatus<T extends string>(
  amounts: SettlementAmounts,
  openStatus: T
): T | "paid" | "partially_paid" {
  if (outstandingBalance(amounts) <= 0) {
    return "paid";
  }
  if (amounts.amountPaid > 0 || amounts.amountCredited > 0) {
    return "partially_paid";
  }
  return openStatus;
}

/**
 * Splits a credit note between the document's open balance and the part that
 * was already settled, which becomes a credit in the party's favour.
 * Returns null when the note is larger than what can still be credited.
 */
export function allocateCreditNote(params: {
  noteTotal: number;
  balance: number;
  documentTotal: number;
  amountDebited?: number;
  creditNotesTotal: number;
}) {
  const creditable = roundMoney(
    params.documentTotal + (params.amountDebited ?? 0) - params.creditNotesTotal
  );
  const noteTotal = roundMoney(params.noteTotal);
  if (noteTotal > creditable) {
    return null;
  }
  const applied = Math.min(noteTotal, Math.max(roundMoney(params.balance), 0));
  return { applied, unapplied: roundMoney(noteTotal - applied) };
}

/**
 * Invoices saved before `amountDebited` existed carried debit notes only in
 * their balance, so the missing amount is recovered from it.
 */
export function deriveAmountDebited(params: {
  stored?: unknown;
  status: string;
  total: number;
  amountPaid: number;
  amountCredited: number;
  balance: number;
}) {
  if (typeof params.stored === "number") {
    return params.stored;
  }
  if (params.status === "draft" || params.status === "canceled") {
    return 0;
  }
  return Math.max(
    roundMoney(
      params.balance - (params.total - params.amountPaid - params.amountCredited)
    ),
    0
  );
}
