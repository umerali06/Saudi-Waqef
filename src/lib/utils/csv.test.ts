import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/utils/csv";

describe("csv utils", () => {
  it("parses quoted values", () => {
    const input = "name,notes\n\"Acme, Inc\",\"Hello \"\"world\"\"\"";
    const parsed = parseCsv(input);

    expect(parsed.headers).toEqual(["name", "notes"]);
    expect(parsed.rows).toEqual([["Acme, Inc", "Hello \"world\""]]);
  });

  it("round trips to CSV", () => {
    const headers = ["name", "notes"];
    const rows = [["Acme", "Line one\nLine two"]];
    const csv = toCsv(headers, rows);
    const parsed = parseCsv(csv);

    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows).toEqual(rows);
  });

  it("prefixes UTF-8 BOM for spreadsheet compatibility", () => {
    const csv = toCsv(["name"], [["عميل"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
