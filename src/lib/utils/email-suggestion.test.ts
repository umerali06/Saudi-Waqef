import { describe, expect, it } from "vitest";
import { suggestEmail } from "@/lib/utils/email-suggestion";

describe("suggestEmail", () => {
  it("catches one-letter slips and swaps in common domains", () => {
    expect(suggestEmail("owner@gnail.com")).toBe("owner@gmail.com");
    expect(suggestEmail("owner@gmial.com")).toBe("owner@gmail.com");
    expect(suggestEmail("owner@gmail.co")).toBe("owner@gmail.com");
    expect(suggestEmail("owner@hotmal.com")).toBe("owner@hotmail.com");
  });

  it("leaves correct, company and half-typed addresses alone", () => {
    expect(suggestEmail("owner@gmail.com")).toBeNull();
    expect(suggestEmail("owner@example.sa")).toBeNull();
    expect(suggestEmail("owner@g")).toBeNull();
    expect(suggestEmail("")).toBeNull();
  });
});
