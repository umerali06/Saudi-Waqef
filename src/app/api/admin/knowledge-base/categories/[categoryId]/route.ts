import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { updateKbCategory } from "@/lib/data/knowledge-base";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  nameAr: z.string().trim().min(1).optional(),
  nameEn: z.string().trim().min(1).optional(),
  descriptionAr: z.string().trim().optional().nullable(),
  descriptionEn: z.string().trim().optional().nullable(),
  slug: z.string().trim().optional().nullable(),
  order: z.number().min(0).optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ categoryId: string }> }
) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const params = await context.params;
  await updateKbCategory(params.categoryId, parsed.data);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.kb.category.update",
    entity: "kb_category",
    entityId: params.categoryId,
  });

  return NextResponse.json({ success: true });
}
