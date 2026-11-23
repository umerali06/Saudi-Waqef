import { describe, expect, it } from "vitest";
import { generateCsr } from "@/lib/integrations/zatca/certificate";
import { ZatcaApi } from "@/lib/integrations/zatca/api";
import {
  buildAndSignComplianceScenario,
  buildComplianceDocument,
  complianceScenariosFor,
} from "@/lib/integrations/zatca/compliance-scenarios";
import { signZatcaDocument, toSubmissionBody } from "@/lib/integrations/zatca/document";

/**
 * Runs the whole onboarding and submission path against ZATCA's public
 * developer sandbox (dummy taxpayer, public OTP, no legal effect).
 *   ZATCA_E2E=1 npx vitest run src/lib/integrations/zatca/sandbox.e2e.test.ts
 */
const SANDBOX_OTP = "123345";
const supplier = {
  name: "شركة الاختبار المحدودة",
  vatNumber: "399999999900003",
  crNumber: "1010010000",
  address: {
    street: "طريق الملك فهد",
    building: "1234",
    district: "العليا",
    city: "الرياض",
    postalCode: "12211",
    countryCode: "SA",
  },
};

describe.skipIf(process.env.ZATCA_E2E !== "1")("ZATCA developer sandbox", () => {
  it("onboards, passes every compliance document and files both invoice types", async () => {
    const api = new ZatcaApi("sandbox", 60000);
    const csr = generateCsr(
      {
        organizationName: "QA Test Company",
        organizationalUnit: "QA Test Company",
        commonName: `EGS-${supplier.vatNumber}-qa`,
        vatNumber: supplier.vatNumber,
        invoiceType: "1100",
        registeredAddress: "1234 King Fahd Road, Olaya, Riyadh 12211",
        businessCategory: "Accounting",
        egsSerialNumber: "1-SaudiWaqef|2-1.0|3-ed22f1d8-e6a2-1118-9b58-d9a8f11e445f",
      },
      "sandbox"
    );
    const compliance = await api.issueComplianceCsid(csr.csr, SANDBOX_OTP);

    const failures: Record<string, unknown> = {};
    for (const id of complianceScenariosFor("1100")) {
      const signed = buildAndSignComplianceScenario(id, {
        supplier,
        privateKeyPem: csr.privateKey,
        certificate: compliance.binarySecurityToken,
      });
      const check = await api.checkCompliance(compliance, toSubmissionBody(signed));
      if (!check.valid || check.alerts.length > 0) failures[id] = check.alerts;
    }
    expect(failures).toEqual({});

    // The sandbox hands every taxpayer the same production certificate, which
    // cannot match our key. Filing therefore authenticates with the production
    // CSID while the document is signed with the compliance pair.
    const production = await api.issueProductionCsid(compliance, compliance.requestId);
    for (const id of ["SIMPLIFIED_INVOICE", "STANDARD_INVOICE"] as const) {
      const signed = signZatcaDocument({
        document: buildComplianceDocument(id, supplier),
        privateKeyPem: csr.privateKey,
        certificate: compliance.binarySecurityToken,
      });
      const verdict = await api.submit(
        id === "STANDARD_INVOICE" ? "clearance" : "reporting",
        production,
        toSubmissionBody(signed)
      );
      const alerts = verdict.alerts.filter((alert) => alert.code !== "certificate-issuer-name");
      expect({ id, accepted: verdict.accepted, alerts }).toEqual({
        id,
        accepted: true,
        alerts: [],
      });
    }
  }, 240000);
});
