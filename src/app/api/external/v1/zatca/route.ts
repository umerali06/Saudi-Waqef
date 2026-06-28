import { NextResponse } from "next/server";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:accounting", "write:accounting"], async () =>
    NextResponse.json({
      data: {
        name: "ZATCA Integration Layer",
        environmentRequiredForTesting: "sandbox",
        endpoints: {
          status: "GET /api/external/v1/zatca/status?integrationId=<ID>",
          requestComplianceCsid: "POST /api/external/v1/zatca/csid/request",
          complianceCheck: "POST /api/external/v1/zatca/compliance/check",
          requestProductionCsid: "POST /api/external/v1/zatca/production/csid",
          signInvoice: "POST /api/external/v1/zatca/invoice/sign",
          submitDocuments: "POST /api/external/v1/zatca/production/submit",
        },
      },
    })
  );
}
