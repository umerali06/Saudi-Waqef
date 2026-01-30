import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess, requireCompanyRole } from "@/lib/access";
import { getDocumentBranding, updateDocumentBranding } from "@/lib/data/document-branding";
import { documentBrandingSchema } from "@/lib/validators/company";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branding = await getDocumentBranding(companyId);
  return NextResponse.json({ branding });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = documentBrandingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId, ...updates } = parsed.data;
  await updateDocumentBranding(companyId, updates);
  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "document_branding.update",
    entity: "document_branding",
    entityId: companyId,
    metadata: { fields: Object.keys(updates) },
  });
  return NextResponse.json({ ok: true });
}
