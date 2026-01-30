import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole, requireDocumentAccess } from "@/lib/access";
import {
  deleteDocument,
  getDocumentById,
  updateDocumentMetadata,
} from "@/lib/data/documents";
import { documentUpdateSchema } from "@/lib/validators/documents";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;
  const document = await getDocumentById(documentId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireDocumentAccess(user.id, document.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    document: {
      ...document,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt ? document.updatedAt.toISOString() : null,
      versions: (document.versions ?? []).map((version) => ({
        ...version,
        replacedAt: version.replacedAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;
  const document = await getDocumentById(documentId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = documentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, document.companyId, [
    "owner",
    "admin",
    "accountant",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await updateDocumentMetadata(documentId, parsed.data);

  await recordAuditEvent({
    companyId: document.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "document.update",
    entity: "document",
    entityId: documentId,
    metadata: parsed.data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;
  const document = await getDocumentById(documentId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, document.companyId, [
    "owner",
    "admin",
    "accountant",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteDocument(documentId);

  await recordAuditEvent({
    companyId: document.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "document.delete",
    entity: "document",
    entityId: documentId,
    metadata: { name: document.name, docType: document.docType },
  });

  return NextResponse.json({ ok: true });
}
