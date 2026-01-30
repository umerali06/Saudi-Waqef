import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { updateKbGlossaryTerm } from "@/lib/data/knowledge-base";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  termAr: z.string().trim().min(1).optional(),
  termEn: z.string().trim().min(1).optional(),
  definitionAr: z.string().trim().min(1).optional(),
  definitionEn: z.string().trim().min(1).optional(),
  category: z.string().trim().optional().nullable(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ termId: string }> }
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
  await updateKbGlossaryTerm(params.termId, parsed.data);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.kb.glossary.update",
    entity: "kb_glossary",
    entityId: params.termId,
  });

  return NextResponse.json({ success: true });
}
