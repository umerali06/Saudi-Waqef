import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { documentReplaceSchema } from "@/lib/validators/documents";
import { getDocumentById, replaceDocument } from "@/lib/data/documents";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

const isCloudinaryType = (contentType: string) =>
  contentType.startsWith("image/") ||
  contentType.startsWith("video/") ||
  contentType === "application/pdf";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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
  const parsed = documentReplaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== document.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
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

  if (parsed.data.storage === "cloudinary" && !parsed.data.url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  if (parsed.data.storage === "firestore" && !parsed.data.content) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }
  if (
    parsed.data.storage === "firestore" &&
    parsed.data.size > FIRESTORE_ATTACHMENT_LIMIT
  ) {
    return NextResponse.json({ error: "Attachment too large" }, { status: 400 });
  }
  if (
    parsed.data.storage === "cloudinary" &&
    !isCloudinaryType(parsed.data.contentType)
  ) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  const updated = await replaceDocument({
    documentId,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    storage: parsed.data.storage,
    url: parsed.data.url ?? null,
    content: parsed.data.content ?? null,
    replacedBy: user.id,
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await recordAuditEvent({
    companyId: document.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "document.replace",
    entity: "document",
    entityId: documentId,
    metadata: {
      name: document.name,
      storage: parsed.data.storage,
      contentType: parsed.data.contentType,
    },
  });

  return NextResponse.json({
    document: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
      versions: (updated.versions ?? []).map((version) => ({
        ...version,
        replacedAt: version.replacedAt.toISOString(),
      })),
    },
  });
}
