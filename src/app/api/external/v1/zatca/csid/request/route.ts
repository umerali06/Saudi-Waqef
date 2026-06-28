import { NextResponse } from "next/server";
import {
  getZatcaIntegrationForCompany,
  requestZatcaComplianceCsid,
} from "@/lib/integrations/zatca/onboarding";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  return withExternalApiAuth(request, ["write:accounting", "write:settings"], async ({
    companyId,
  }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const integrationId = text(body.integrationId);
    const otp = text(body.otp);
    if (!integrationId || !otp) {
      return NextResponse.json(
        { error: "integrationId and otp are required" },
        { status: 400 }
      );
    }

    const integration = await getZatcaIntegrationForCompany({ integrationId, companyId });
    if (integration.environment !== "sandbox") {
      return NextResponse.json(
        { error: "Use a sandbox integration for testing. Production onboarding must be run separately." },
        { status: 400 }
      );
    }
    const result = await requestZatcaComplianceCsid({ integration, otp });
    return NextResponse.json({ ok: true, data: result });
  });
}
