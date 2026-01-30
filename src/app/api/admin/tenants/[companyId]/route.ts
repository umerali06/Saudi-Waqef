import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { updateCompanyStatus } from "@/lib/data/companies";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["active", "suspended"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ companyId: string }> }
) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { companyId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await updateCompanyStatus(companyId, parsed.data.status);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.tenant.status",
    entity: "company",
    entityId: companyId,
    metadata: { status: parsed.data.status },
  });

  return NextResponse.json({ success: true });
}
