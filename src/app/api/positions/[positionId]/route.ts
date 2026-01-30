import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { positionSchema, positionUpdateSchema } from "@/lib/validators/hr";
import { getPositionById, listPositions, updatePosition } from "@/lib/data/positions";
import { getDepartmentById } from "@/lib/data/departments";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ positionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { positionId } = await context.params;
  const position = await getPositionById(positionId);
  if (!position) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireHrAccess(user.id, position.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ position });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { positionId } = await context.params;
  const current = await getPositionById(positionId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = positionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, current.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.departmentId) {
    const department = await getDepartmentById(parsed.data.departmentId);
    if (!department || department.companyId !== current.companyId) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }
  }

  const merged = {
    ...current,
    ...parsed.data,
    companyId: current.companyId,
  };
  const mergedValidation = positionSchema.safeParse(merged);
  if (!mergedValidation.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await listPositions(current.companyId);
  const nameAr = normalizeSearch(merged.nameAr);
  const nameEn = normalizeSearch(merged.nameEn);
  const code = normalizeSearch(merged.code ?? "");
  const duplicate = existing.find((position) => {
    if (position.id === positionId) {
      return false;
    }
    if (code && normalizeSearch(position.code ?? "") === code) {
      return true;
    }
    return (
      normalizeSearch(position.nameAr) === nameAr ||
      normalizeSearch(position.nameEn) === nameEn
    );
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate position" }, { status: 409 });
  }

  await updatePosition(positionId, parsed.data);

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "position.update",
    entity: "position",
    entityId: positionId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

