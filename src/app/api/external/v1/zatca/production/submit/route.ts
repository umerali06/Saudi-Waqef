import { NextResponse } from "next/server";
import {
  getZatcaIntegrationForCompany,
  submitZatcaProductionDocuments,
} from "@/lib/integrations/zatca/onboarding";
import { validateIntegrationReadiness } from "@/lib/integrations/validation";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  return withExternalApiAuth(request, ["write:accounting"], async ({ companyId }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const integrationId = text(body.integrationId);
    if (!integrationId) {
      return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
    }

    const integration = await getZatcaIntegrationForCompany({ integrationId, companyId });
    const readiness = await validateIntegrationReadiness(integration);
    if (!readiness.ok) {
      return NextResponse.json(
        { ok: false, error: readiness.errors.join(" "), readiness },
        { status: 400 }
      );
    }

    const result = await submitZatcaProductionDocuments({ integration });
    return NextResponse.json(
      {
        ok: result.ok,
        status: result.status,
        statusText: result.statusText,
        data: result.bodyJson,
      },
      { status: result.ok ? 200 : 422 }
    );
  });
}
