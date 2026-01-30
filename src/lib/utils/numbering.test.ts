import { describe, expect, it } from "vitest";
import { buildSequenceNumber } from "@/lib/utils/numbering";

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
