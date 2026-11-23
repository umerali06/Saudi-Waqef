import { describe, expect, it } from "vitest";
import {
  allocateCreditNote,
  deriveAmountDebited,
  exceedsBalance,
  outstandingBalance,
  settlementStatus,
} from "@/lib/utils/settlement";

describe("outstandingBalance", () => {
  it("keeps debit notes owed after a partial payment", () => {
    const invoice = { total: 1150, amountPaid: 1200, amountCredited: 0, amountDebited: 115 };
    expect(outstandingBalance(invoice)).toBe(65);
    expect(settlementStatus(invoice, "approved")).toBe("partially_paid");
  });

  it("settles amounts stored at full precision", () => {
    expect(exceedsBalance(38.33, 38.3295)).toBe(false);
    const paid = { total: 38.3295, amountPaid: 38.33, amountCredited: 0 };
    expect(outstandingBalance(paid)).toBe(0);
    expect(settlementStatus(paid, "approved")).toBe("paid");
  });

  it("keeps the open status while nothing is settled", () => {
    expect(
      settlementStatus(
        { total: 100, amountPaid: 0, amountCredited: 0, amountDebited: 10 },
        "sent"
      )
    ).toBe("sent");
  });
});

describe("allocateCreditNote", () => {
  it("turns a credit on a paid invoice into a customer credit", () => {
    expect(
      allocateCreditNote({ noteTotal: 500, balance: 0, documentTotal: 1150, creditNotesTotal: 0 })
    ).toEqual({ applied: 0, unapplied: 500 });
  });

  it("applies to the open balance first", () => {
    expect(
      allocateCreditNote({ noteTotal: 500, balance: 150, documentTotal: 1150, creditNotesTotal: 0 })
    ).toEqual({ applied: 150, unapplied: 350 });
  });

  it("refuses more than is left to credit", () => {
    const params = { balance: 0, documentTotal: 1150, creditNotesTotal: 1000 };
    expect(allocateCreditNote({ ...params, noteTotal: 151 })).toBeNull();
    expect(allocateCreditNote({ ...params, noteTotal: 151, amountDebited: 10 })).not.toBeNull();
  });
});

describe("deriveAmountDebited", () => {
  const base = { status: "approved", total: 1150, amountPaid: 1150, amountCredited: 0 };

  it("recovers debit notes of older invoices from their balance", () => {
    expect(deriveAmountDebited({ ...base, balance: 115 })).toBe(115);
    expect(deriveAmountDebited({ ...base, balance: 0 })).toBe(0);
  });

  it("uses the stored amount and ignores canceled invoices", () => {
    expect(deriveAmountDebited({ ...base, stored: 20, balance: 115 })).toBe(20);
    expect(deriveAmountDebited({ ...base, status: "canceled", balance: 115 })).toBe(0);
  });
});
