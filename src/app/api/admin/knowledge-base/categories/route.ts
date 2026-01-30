import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import {
  createKbCategory,
  listKbCategories,
} from "@/lib/data/knowledge-base";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  descriptionAr: z.string().trim().optional().nullable(),
  descriptionEn: z.string().trim().optional().nullable(),
  slug: z.string().trim().optional().nullable(),
  order: z.number().min(0).optional(),
});

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const categories = await listKbCategories();
  return NextResponse.json({
    categories,
  });
}

export async function POST(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const id = await createKbCategory(parsed.data);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.kb.category.create",
    entity: "kb_category",
    entityId: id,
  });

  return NextResponse.json({ id });
}
