import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership, requireCompanyRole } from "@/lib/access";
import { leaveTypeSchema } from "@/lib/validators/leave";
import { listLeaveTypes, createLeaveType } from "@/lib/data/leave-types";
import { normalizeSearch } from "@/lib/utils/search";
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

  const types = await listLeaveTypes(companyId);
  return NextResponse.json({ types });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await listLeaveTypes(parsed.data.companyId);
  const codeNormalized = normalizeSearch(parsed.data.code);
  const nameNormalized = normalizeSearch(parsed.data.name);
  const duplicate = existing.find(
    (type) =>
      normalizeSearch(type.code) === codeNormalized ||
      normalizeSearch(type.name) === nameNormalized
  );
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate leave type" }, { status: 409 });
  }

  const typeId = await createLeaveType({
    ...parsed.data,
    status: parsed.data.status ?? "active",
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "leave.type.create",
    entity: "leave_type",
    entityId: typeId,
    metadata: { name: parsed.data.name, code: parsed.data.code },
  });

  return NextResponse.json({ typeId });
}
