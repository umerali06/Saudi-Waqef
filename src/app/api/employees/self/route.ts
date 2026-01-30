import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership } from "@/lib/access";
import { employeeSelfUpdateSchema } from "@/lib/validators/hr";
import { listEmployees, updateEmployee } from "@/lib/data/employees";
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

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await listEmployees(companyId);
  const employee = employees.find((entry) => entry.userId === user.id) ?? null;
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ employee });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = employeeSelfUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await listEmployees(parsed.data.companyId);
  const employee = employees.find((entry) => entry.userId === user.id);
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await updateEmployee(employee.id, {
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "employee.self_update",
    entity: "employee",
    entityId: employee.id,
    metadata: { fields: ["email", "phone", "address"] },
  });

  return NextResponse.json({ ok: true });
}
