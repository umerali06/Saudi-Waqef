import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireDocumentAccess } from "@/lib/access";
import { listDocuments } from "@/lib/data/documents";
import { toCsv } from "@/lib/utils/csv";

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

  const membership = await requireDocumentAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const documents = await listDocuments(companyId);
  const headers = [
    "ID",
    "Name",
    "Type",
    "Tags",
    "Entity Type",
    "Entity ID",
    "Storage",
    "Content Type",
    "Size",
    "Uploaded By",
    "Created At",
    "Updated At",
  ];
  const rows = documents.map((doc) => [
    doc.id,
    doc.name,
    doc.docType,
    doc.tags.join(", "),
    doc.entityType ?? "",
    doc.entityId ?? "",
    doc.storage,
    doc.contentType,
    String(doc.size),
    doc.uploadedByEmail ?? "",
    doc.createdAt.toISOString(),
    doc.updatedAt ? doc.updatedAt.toISOString() : "",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=documents.csv",
    },
  });
}
