import { NextResponse } from "next/server";
import {
  getZatcaIntegrationForCompany,
  verifyZatcaCompliance,
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
    if (!integrationId) {
      return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
    }

    const integration = await getZatcaIntegrationForCompany({ integrationId, companyId });
    if (integration.environment !== "sandbox") {
      return NextResponse.json(
        { error: "Compliance checks must be completed in sandbox before production." },
        { status: 400 }
      );
    }
    const result = await verifyZatcaCompliance({ integration });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  });
}
