import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole, requireDocumentAccess } from "@/lib/access";
import { documentSchema } from "@/lib/validators/documents";
import { createDocument, listDocuments } from "@/lib/data/documents";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

const isCloudinaryType = (contentType: string) =>
  contentType.startsWith("image/") ||
  contentType.startsWith("video/") ||
  contentType === "application/pdf";

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

  const membership = await requireDocumentAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const documents = await listDocuments(companyId);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const docType = searchParams.get("docType") ?? "all";
  const entityType = searchParams.get("entityType") ?? "all";
  const tag = searchParams.get("tag")?.trim().toLowerCase();

  let filtered = documents;
  if (docType && docType !== "all") {
    filtered = filtered.filter((doc) => doc.docType === docType);
  }
  if (entityType && entityType !== "all") {
    filtered = filtered.filter((doc) => doc.entityType === entityType);
  }
  if (tag) {
    filtered = filtered.filter((doc) =>
      doc.tags.some((value) => value.toLowerCase() === tag)
    );
  }
  if (q) {
    filtered = filtered.filter((doc) =>
      [doc.name, doc.entityType ?? "", doc.entityId ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  return NextResponse.json({
    documents: filtered.map((doc) => ({
      ...doc,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
      versions: (doc.versions ?? []).map((version) => ({
        ...version,
        replacedAt: version.replacedAt.toISOString(),
      })),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = documentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
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

  const documentId = await createDocument({
    companyId: parsed.data.companyId,
    name: parsed.data.name,
    docType: parsed.data.docType,
    tags: parsed.data.tags,
    entityType: parsed.data.entityType ?? null,
    entityId: parsed.data.entityId ?? null,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    storage: parsed.data.storage,
    url: parsed.data.url ?? null,
    content: parsed.data.content ?? null,
    uploadedBy: user.id,
    uploadedByEmail: user.email ?? null,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "document.create",
    entity: "document",
    entityId: documentId,
    metadata: {
      name: parsed.data.name,
      docType: parsed.data.docType,
      storage: parsed.data.storage,
    },
  });

  return NextResponse.json({ documentId });
}
