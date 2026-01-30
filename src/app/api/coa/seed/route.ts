import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { createChartAccountsFromTemplate } from "@/lib/data/chart-accounts";
import { coaTemplateSchema } from "@/lib/validators/company";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = coaTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const codes = new Set<string>();
  for (const item of parsed.data.template) {
    if (codes.has(item.code)) {
      return NextResponse.json(
        { error: "Duplicate account codes in template" },
        { status: 400 }
      );
    }
    codes.add(item.code);
  }
  const invalidParent = parsed.data.template.find(
    (item) => item.parentCode && !codes.has(item.parentCode)
  );
  if (invalidParent) {
    return NextResponse.json(
      { error: "Template has unknown parent codes" },
      { status: 400 }
    );
  }

  const result = await createChartAccountsFromTemplate(
    parsed.data.companyId,
    parsed.data.template
  );
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "coa.seed",
    entity: "chart_account",
    metadata: { count: parsed.data.template.length },
  });
  return NextResponse.json(result);
}
