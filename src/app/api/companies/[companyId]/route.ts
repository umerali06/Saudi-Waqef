import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess, requireCompanyMembership } from "@/lib/access";
import { getCompanyById, updateCompany } from "@/lib/data/companies";
import type { CompanyRecord } from "@/lib/data/companies";
import { companyProfileSchema } from "@/lib/validators/company";
import { recordAuditEvent } from "@/lib/data/audit-log";

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
  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await getCompanyById(companyId);
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ company });
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
  const parsed = companyProfileSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.[0];
    let message = "Invalid payload";
    if (field === "vatNumber") {
      message = "Invalid VAT number";
    } else if (field === "name") {
      message = "Invalid name";
    } else if (field === "defaultLanguage") {
      message = "Invalid default language";
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const normalized = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [
      key,
      value === null ? undefined : value,
    ])
  ) as Partial<Omit<CompanyRecord, "id" | "createdAt">>;
  await updateCompany(companyId, normalized);
  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "company.update",
    entity: "company",
    entityId: companyId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ok: true });
}

