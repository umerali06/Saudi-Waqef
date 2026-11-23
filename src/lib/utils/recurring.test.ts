import { describe, expect, it } from "vitest";
import { nextRunAfter } from "@/lib/utils/recurring";

describe("nextRunAfter", () => {
  it("stays on the last day of short months and returns to the anchor day", () => {
    expect(nextRunAfter("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextRunAfter("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextRunAfter("2028-01-30", "monthly", 30)).toBe("2028-02-29");
  });

  it("crosses years and weeks", () => {
    expect(nextRunAfter("2026-12-15", "monthly", 15)).toBe("2027-01-15");
    expect(nextRunAfter("2026-12-28", "weekly", 28)).toBe("2027-01-04");
  });
});
