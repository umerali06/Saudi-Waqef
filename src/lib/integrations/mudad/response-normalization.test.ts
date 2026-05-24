import { describe, expect, it } from "vitest";
import { normalizeMudadResults } from "@/lib/integrations/mudad/response-normalization";

describe("normalizeMudadResults", () => {
  it("normalizes worker responses across payload variants", () => {
    const results = normalizeMudadResults({
      workers: [
        { employeeId: "e1", outcome: "ok", reference: "m1" },
        { employeeNumber: "E-2", status: "failed", message: "not eligible" },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ employeeId: "e1", status: "accepted", reference: "m1" });
    expect(results[1]).toMatchObject({
      employeeId: "E-2",
      status: "rejected",
      message: "not eligible",
    });
  });
});

