import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import {
  createKbArticle,
  listKbArticles,
} from "@/lib/data/knowledge-base";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  categoryId: z.string().trim().min(1),
  titleAr: z.string().trim().min(1),
  titleEn: z.string().trim().min(1),
  summaryAr: z.string().trim().optional().nullable(),
  summaryEn: z.string().trim().optional().nullable(),
  contentAr: z.string().trim().min(1),
  contentEn: z.string().trim().min(1),
  tags: z.array(z.string()).optional(),
  slug: z.string().trim().optional().nullable(),
  isPublished: z.boolean().optional(),
});

export async function GET(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const query = searchParams.get("q");

  const articles = await listKbArticles({
    categoryId,
    query,
    includeDrafts: true,
    limitCount: 200,
  });

  return NextResponse.json({ articles });
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

  const id = await createKbArticle(parsed.data);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.kb.article.create",
    entity: "kb_article",
    entityId: id,
  });

  return NextResponse.json({ id });
}
