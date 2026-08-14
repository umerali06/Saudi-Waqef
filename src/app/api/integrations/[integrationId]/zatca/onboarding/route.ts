import { NextResponse } from "next/server";
import { ZatcaError } from "@talha7k/zatca";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { zatcaOtpConfirmSchema } from "@/lib/validators/zatca-wizard";
import {
  requestZatcaComplianceCsid,
  requestZatcaProductionCsid,
  verifyZatcaCompliance,
} from "@/lib/integrations/zatca/onboarding";

export const runtime = "nodejs";

type Context = { params: Promise<{ integrationId: string }> };
type Action = "compliance-csid" | "verify-compliance" | "production-csid";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { integrationId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration || integration.connector !== "zatca") {
    return NextResponse.json({ error: "ZATCA integration not found" }, { status: 404 });
  }
  const membership = await requireCompanyRole(user.id, integration.companyId, ["owner", "admin"]);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action) as Action;

  try {
    if (action === "compliance-csid") {
      const parsed = zatcaOtpConfirmSchema.safeParse({ otp: body.otp });
      if (!parsed.success) {
        return NextResponse.json({ error: "A valid one-time code is required." }, { status: 400 });
      }
      await requestZatcaComplianceCsid({ integration, otp: parsed.data.otp });
    } else if (action === "verify-compliance") {
      const result = await verifyZatcaCompliance({ integration });
      if (!result.ok) return NextResponse.json(result, { status: 422 });
      return NextResponse.json(result);
    } else if (action === "production-csid") {
      await requestZatcaProductionCsid({ integration });
    } else {
      return NextResponse.json({ error: "Unsupported onboarding action" }, { status: 400 });
    }

    await recordAuditEvent({
      companyId: integration.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: `integration.zatca.${action}`,
      entity: "integration",
      entityId: integration.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZatcaError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ZATCA onboarding failed" },
      { status: 400 }
    );
  }
}
