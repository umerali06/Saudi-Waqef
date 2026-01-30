import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { updateKbArticle } from "@/lib/data/knowledge-base";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  categoryId: z.string().trim().min(1).optional(),
  titleAr: z.string().trim().min(1).optional(),
  titleEn: z.string().trim().min(1).optional(),
  summaryAr: z.string().trim().optional().nullable(),
  summaryEn: z.string().trim().optional().nullable(),
  contentAr: z.string().trim().min(1).optional(),
  contentEn: z.string().trim().min(1).optional(),
  tags: z.array(z.string()).optional(),
  slug: z.string().trim().optional().nullable(),
  isPublished: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ articleId: string }> }
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
  await updateKbArticle(params.articleId, parsed.data);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.kb.article.update",
    entity: "kb_article",
    entityId: params.articleId,
  });

  return NextResponse.json({ success: true });
}
