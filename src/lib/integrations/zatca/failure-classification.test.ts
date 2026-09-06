import { describe, expect, it } from "vitest";
import { classifyZatcaSubmissionFailure } from "@/lib/integrations/zatca/failure-classification";

describe("ZATCA submission failure classification", () => {
  it("treats a validation rejection as permanent", () => {
    expect(
      classifyZatcaSubmissionFailure({
        httpStatus: 400,
        alerts: [{ code: "BR-KSA-15", message: "Invoice type code is invalid" }],
      })
    ).toBe("permanent");
  });

  it("treats server errors and throttling as retryable", () => {
    expect(classifyZatcaSubmissionFailure({ httpStatus: 503 })).toBe("retryable");
    expect(classifyZatcaSubmissionFailure({ httpStatus: 429 })).toBe("retryable");
  });

  it("treats a missing HTTP status as retryable", () => {
    expect(classifyZatcaSubmissionFailure({ httpStatus: null })).toBe("retryable");
  });

  it("treats authentication and certificate problems as blocked", () => {
    expect(classifyZatcaSubmissionFailure({ httpStatus: 401 })).toBe("blocked");
    expect(
      classifyZatcaSubmissionFailure({
        httpStatus: 400,
        response: { message: "The certificate expired" },
      })
    ).toBe("blocked");
  });

  it("does not mistake a document rejection for an auth failure", () => {
    expect(
      classifyZatcaSubmissionFailure({
        httpStatus: 422,
        alerts: [{ message: "Buyer VAT registration number is missing" }],
      })
    ).toBe("permanent");
  });
});
