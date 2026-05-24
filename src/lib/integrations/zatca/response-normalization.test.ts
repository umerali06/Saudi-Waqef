import { describe, expect, it } from "vitest";
import { normalizeZatcaResults, normalizeZatcaStatus } from "@/lib/integrations/zatca/response-normalization";

describe("normalizeZatcaStatus", () => {
  it("maps accepted-like statuses to accepted", () => {
    expect(normalizeZatcaStatus("accepted")).toBe("accepted");
    expect(normalizeZatcaStatus("CLEARED")).toBe("accepted");
    expect(normalizeZatcaStatus("success")).toBe("accepted");
    expect(normalizeZatcaStatus("ok")).toBe("accepted");
  });

  it("maps rejected-like statuses to rejected", () => {
    expect(normalizeZatcaStatus("rejected")).toBe("rejected");
    expect(normalizeZatcaStatus("validation_error")).toBe("rejected");
    expect(normalizeZatcaStatus("failed")).toBe("rejected");
  });

  it("falls back to submitted for unknown values", () => {
    expect(normalizeZatcaStatus("pending")).toBe("submitted");
    expect(normalizeZatcaStatus(null)).toBe("submitted");
    expect(normalizeZatcaStatus(undefined)).toBe("submitted");
  });
});

describe("normalizeZatcaResults", () => {
  it("parses payload with results[]", () => {
    const rows = normalizeZatcaResults({
      results: [
        {
          uuid: "u-1",
          status: "accepted",
          providerReference: "ref-1",
          message: "ok",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uuid: "u-1",
      status: "accepted",
      providerReference: "ref-1",
      message: "ok",
    });
  });

  it("parses payload with invoices[] and alternate keys", () => {
    const rows = normalizeZatcaResults({
      invoices: [
        {
          invoiceUuid: "u-2",
          result: "rejected",
          referenceId: "ref-2",
          description: "bad format",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uuid: "u-2",
      status: "rejected",
      providerReference: "ref-2",
      message: "bad format",
    });
  });

  it("parses nested uuid from invoice/document objects", () => {
    const fromInvoice = normalizeZatcaResults({
      data: [{ invoice: { uuid: "u-3" }, processingStatus: "success" }],
    });
    const fromDocument = normalizeZatcaResults({
      documents: [{ document: { uuid: "u-4" }, state: "error", error: "failed" }],
    });

    expect(fromInvoice[0]).toMatchObject({ uuid: "u-3", status: "accepted" });
    expect(fromDocument[0]).toMatchObject({
      uuid: "u-4",
      status: "rejected",
      message: "failed",
    });
  });

  it("supports array root payload", () => {
    const rows = normalizeZatcaResults([
      { uuid: "u-5", status: "accepted", clearanceId: "clr-1" },
      { uuid: "u-6", status: "pending" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      uuid: "u-5",
      status: "accepted",
      providerReference: "clr-1",
    });
    expect(rows[1]).toMatchObject({
      uuid: "u-6",
      status: "submitted",
    });
  });

  it("filters invalid rows without uuid", () => {
    const rows = normalizeZatcaResults({
      results: [
        { status: "accepted" },
        { uuid: "u-7", status: "accepted" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].uuid).toBe("u-7");
  });
});

