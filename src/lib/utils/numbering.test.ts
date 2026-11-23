import { describe, expect, it } from "vitest";
import { buildSequenceNumber, lowersNextNumber } from "@/lib/utils/numbering";

describe("buildSequenceNumber", () => {
  it("applies tokens, padding, suffix", () => {
    const result = buildSequenceNumber({
      prefix: "INV-{YYYY}-",
      suffix: "-A",
      nextNumber: 12,
      padding: 4,
      resetYearly: false,
      lastResetYear: 2025,
      date: "2026-01-15",
    });

    expect(result.number).toBe("INV-2026-0012-A");
    expect(result.nextNumber).toBe(13);
    expect(result.resetYear).toBe(2025);
  });

  it("resets yearly when configured", () => {
    const result = buildSequenceNumber({
      prefix: "BILL-{YY}-",
      nextNumber: 99,
      padding: 3,
      resetYearly: true,
      lastResetYear: 2024,
      date: "2026-05-02",
    });

    expect(result.number).toBe("BILL-26-001");
    expect(result.nextNumber).toBe(2);
    expect(result.resetYear).toBe(2026);
  });
});

describe("yearly counters", () => {
  const options = { prefix: "INV-{YYYY}-", resetYearly: true };

  it("leaves the running year alone when a document is backdated", () => {
    const backdated = buildSequenceNumber({
      ...options,
      nextNumber: 11,
      lastResetYear: 2026,
      yearCounters: { "2025": 40 },
      date: "2025-12-31",
    });
    expect(backdated.number).toBe("INV-2025-40");
    expect(backdated.nextNumber).toBe(11);
    expect(backdated.resetYear).toBe(2026);
    expect(backdated.yearCounters).toEqual({ "2025": 41 });

    const current = buildSequenceNumber({
      ...options,
      nextNumber: backdated.nextNumber,
      lastResetYear: backdated.resetYear,
      yearCounters: backdated.yearCounters,
      date: "2026-01-20",
    });
    expect(current.number).toBe("INV-2026-11");
  });

  it("remembers the finished year when a new one starts", () => {
    const result = buildSequenceNumber({
      ...options,
      nextNumber: 99,
      lastResetYear: 2025,
      date: "2026-01-01",
    });
    expect(result.number).toBe("INV-2026-1");
    expect(result.yearCounters).toEqual({ "2025": 99 });
  });

  it("continues the counter when yearly reset is first turned on", () => {
    const result = buildSequenceNumber({
      ...options,
      nextNumber: 50,
      lastResetYear: null,
      date: "2026-03-01",
    });
    expect(result.number).toBe("INV-2026-50");
    expect(result.resetYear).toBe(2026);
  });

  it("skips taken numbers", () => {
    const result = buildSequenceNumber({ prefix: "INV-", nextNumber: 5, skip: 3 });
    expect(result.number).toBe("INV-8");
    expect(result.nextNumber).toBe(9);
  });
});

describe("lowersNextNumber", () => {
  it("flags only counters that go down", () => {
    const current = { invoiceNextNumber: 10, vatRate: 15 };
    expect(lowersNextNumber(current, { invoiceNextNumber: 9 })).toBe(true);
    expect(lowersNextNumber(current, { invoiceNextNumber: 10 })).toBe(false);
    expect(lowersNextNumber(current, { vatRate: 5 })).toBe(false);
  });
});
