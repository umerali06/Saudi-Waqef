import { describe, expect, it } from "vitest";
import { formatDocumentDate } from "@/lib/utils/document-date";

describe("formatDocumentDate", () => {
  it("follows the company's format", () => {
    expect(formatDocumentDate("2026-03-09", "yyyy-MM-dd")).toBe("2026-03-09");
    expect(formatDocumentDate("2026-03-09", "dd/MM/yyyy")).toBe("09/03/2026");
    expect(formatDocumentDate("2026-03-09", "MM/dd/yyyy")).toBe("03/09/2026");
    expect(formatDocumentDate("", "dd/MM/yyyy")).toBe("");
  });
});
