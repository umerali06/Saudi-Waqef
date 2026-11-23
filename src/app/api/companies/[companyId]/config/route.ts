import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireAdminAccess } from "@/lib/access";
import { getCompanyConfig, updateCompanyConfig } from "@/lib/data/company-config";
import { companyConfigSchema } from "@/lib/validators/company";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { seedCompanyDefaults, updateStandardVatRate } from "@/lib/data/company-seed";
import { lowersNextNumber } from "@/lib/utils/numbering";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ companyId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await context.params;
  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getCompanyConfig(companyId, { fresh: true });
  return NextResponse.json({ config });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await context.params;
  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = companyConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const current = await getCompanyConfig(companyId, { fresh: true });
  if (lowersNextNumber(current, parsed.data)) {
    return NextResponse.json({ error: "NEXT_NUMBER_TOO_LOW" }, { status: 400 });
  }

  await updateCompanyConfig(companyId, parsed.data);
  const vatEnabled = parsed.data.vatEnabled ?? current.vatEnabled;
  if (vatEnabled && (parsed.data.vatEnabled || parsed.data.onboardingCompleted)) {
    await seedCompanyDefaults(companyId);
  }
  if (parsed.data.vatRate !== undefined && parsed.data.vatRate !== current.vatRate) {
    await updateStandardVatRate(companyId, current.vatRate, parsed.data.vatRate);
  }
  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "company.config.update",
    entity: "company_config",
    entityId: companyId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ok: true });
}

