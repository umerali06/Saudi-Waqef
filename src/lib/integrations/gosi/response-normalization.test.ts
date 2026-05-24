import { describe, expect, it } from "vitest";
import { normalizeGosiResults } from "@/lib/integrations/gosi/response-normalization";

describe("normalizeGosiResults", () => {
  it("normalizes employee results with status mapping", () => {
    const results = normalizeGosiResults({
      results: [
        { employeeId: "e1", status: "success", referenceId: "r1" },
        { employeeNumber: "E-2", result: "rejected", error: "invalid" },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ employeeId: "e1", status: "accepted", reference: "r1" });
    expect(results[1]).toMatchObject({
      employeeId: "E-2",
      status: "rejected",
      message: "invalid",
    });
  });
});

