import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { taxCategoryUpdateSchema } from "@/lib/validators/company";
import { getTaxCategory, updateTaxCategory } from "@/lib/data/tax-categories";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ categoryId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = taxCategoryUpdateSchema.safeParse(body);
  if (!parsed.success || typeof body?.companyId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, body.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { categoryId } = await context.params;
  const category = await getTaxCategory(categoryId);
  if (!category || category.companyId !== body.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await updateTaxCategory(categoryId, parsed.data);
  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "tax_category.update",
    entity: "tax_category",
    entityId: categoryId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ok: true });
}
