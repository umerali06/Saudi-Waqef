import { NextResponse } from "next/server";
import {
  getZatcaIntegrationForCompany,
  signZatcaInvoice,
} from "@/lib/integrations/zatca/onboarding";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  return withExternalApiAuth(request, ["write:accounting"], async ({ companyId }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const integrationId = text(body.integrationId);
    const invoiceId = text(body.invoiceId);
    if (!integrationId || !invoiceId) {
      return NextResponse.json(
        { error: "integrationId and invoiceId are required" },
        { status: 400 }
      );
    }

    const integration = await getZatcaIntegrationForCompany({ integrationId, companyId });
    const result = await signZatcaInvoice({ integration, invoiceId });
    return NextResponse.json({ ok: true, data: result });
  });
}
