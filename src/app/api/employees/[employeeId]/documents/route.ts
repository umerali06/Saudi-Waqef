import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { documentSchema } from "@/lib/validators/hr";
import { getEmployeeById } from "@/lib/data/employees";
import { createEmployeeDocument, listEmployeeDocuments } from "@/lib/data/employee-documents";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId } = await context.params;
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireHrAccess(user.id, employee.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["owner", "admin", "hr"].includes(membership.role)) {
    if (employee.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const documents = await listEmployeeDocuments(employeeId);
  return NextResponse.json({ documents });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId } = await context.params;
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = documentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== employee.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, employee.companyId, [
    "owner",
    "admin",
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

  const documentId = await createEmployeeDocument({
    companyId: employee.companyId,
    employeeId,
    type: parsed.data.type,
    name: parsed.data.name,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    storage: parsed.data.storage,
    url: parsed.data.url ?? null,
    content: parsed.data.content ?? null,
    issuedAt: parsed.data.issuedAt ?? null,
    expiresAt: parsed.data.expiresAt ?? null,
  });

  await recordAuditEvent({
    companyId: employee.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "employee.document.create",
    entity: "employee_document",
    entityId: documentId,
    metadata: { employeeId, type: parsed.data.type },
  });

  return NextResponse.json({ documentId });
}

