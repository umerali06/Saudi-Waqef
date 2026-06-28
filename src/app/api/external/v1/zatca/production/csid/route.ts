import { NextResponse } from "next/server";
import {
  getZatcaIntegrationForCompany,
  requestZatcaProductionCsid,
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
    const result = await requestZatcaProductionCsid({ integration });
    return NextResponse.json({ ok: true, data: result });
  });
}
