import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { deleteEmployeeDocument, getEmployeeDocument } from "@/lib/data/employee-documents";
import { getEmployeeById } from "@/lib/data/employees";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ employeeId: string; documentId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId, documentId } = await context.params;
  const document = await getEmployeeDocument(documentId);
  if (!document || document.employeeId !== employeeId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const employee = await getEmployeeById(employeeId);
  if (!employee || employee.companyId !== document.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, employee.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteEmployeeDocument(documentId);

  await recordAuditEvent({
    companyId: employee.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "employee.document.delete",
    entity: "employee_document",
    entityId: documentId,
    metadata: { employeeId },
  });

  return NextResponse.json({ ok: true });
}
