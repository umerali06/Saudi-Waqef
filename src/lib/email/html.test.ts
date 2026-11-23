import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/email/html";

describe("escapeHtml", () => {
  it("neutralises markup and tolerates missing values", () => {
    expect(escapeHtml(`<a href="x">O'Neil & co</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;O&#39;Neil &amp; co&lt;/a&gt;"
    );
    expect(escapeHtml(undefined)).toBe("");
  });
});
