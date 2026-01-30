import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import {
  createKbGlossaryTerm,
  listKbGlossaryTerms,
} from "@/lib/data/knowledge-base";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  termAr: z.string().trim().min(1),
  termEn: z.string().trim().min(1),
  definitionAr: z.string().trim().min(1),
  definitionEn: z.string().trim().min(1),
  category: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  const terms = await listKbGlossaryTerms({ query });
  return NextResponse.json({ terms });
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

  const id = await createKbGlossaryTerm(parsed.data);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.kb.glossary.create",
    entity: "kb_glossary",
    entityId: id,
  });

  return NextResponse.json({ id });
}
