import { describe, expect, it } from "vitest";
import { isBalanced, reverseLines } from "@/lib/utils/journal";
import { buildPurchasePosting, buildSalesPosting } from "@/lib/utils/posting";

const document = {
  lines: [
    { accountId: "services", netAmount: 90, discountAmount: 10 },
    { accountId: "goods", netAmount: 50, discountAmount: 0 },
  ],
  discountTotal: 10,
  taxTotal: 21,
  total: 161,
};

describe("buildSalesPosting", () => {
  it("credits each income account and posts the discount on its own", () => {
    const lines = buildSalesPosting(document, {
      receivableId: "ar",
      vatOutputId: "vat",
      discountId: "discount",
    });
    expect(lines).toEqual([
      { accountId: "ar", debit: 161, credit: 0 },
      { accountId: "services", debit: 0, credit: 100 },
      { accountId: "goods", debit: 0, credit: 50 },
      { accountId: "discount", debit: 10, credit: 0 },
      { accountId: "vat", debit: 0, credit: 21 },
    ]);
    expect(isBalanced(lines)).toBe(true);
    expect(isBalanced(reverseLines(lines))).toBe(true);
  });

  it("balances without a discount account or VAT", () => {
    const lines = buildSalesPosting(
      { ...document, taxTotal: 0, total: 140 },
      { receivableId: "ar", vatOutputId: null, discountId: null }
    );
    expect(isBalanced(lines)).toBe(true);
    expect(lines).toHaveLength(3);
  });
});

describe("buildPurchasePosting", () => {
  it("mirrors the sales posting", () => {
    const lines = buildPurchasePosting(document, {
      payableId: "ap",
      vatInputId: "vat",
      discountId: "discount",
    });
    expect(isBalanced(lines)).toBe(true);
    expect(lines.at(-1)).toEqual({ accountId: "ap", debit: 0, credit: 161 });
  });
});

describe("isBalanced", () => {
  it("rejects a one-cent difference", () => {
    expect(
      isBalanced([
        { accountId: "a", debit: 10, credit: 0 },
        { accountId: "b", debit: 0, credit: 9.98 },
      ])
    ).toBe(false);
  });
});
