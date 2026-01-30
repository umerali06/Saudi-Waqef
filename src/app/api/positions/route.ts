import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { positionSchema } from "@/lib/validators/hr";
import { createPosition, listPositions } from "@/lib/data/positions";
import { getDepartmentById } from "@/lib/data/departments";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

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

  const membership = await requireHrAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const positions = await listPositions(companyId);
  return NextResponse.json({ positions });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = positionSchema.safeParse(body);
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

  if (parsed.data.departmentId) {
    const department = await getDepartmentById(parsed.data.departmentId);
    if (!department || department.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }
  }

  const existing = await listPositions(parsed.data.companyId);
  const nameAr = normalizeSearch(parsed.data.nameAr);
  const nameEn = normalizeSearch(parsed.data.nameEn);
  const code = normalizeSearch(parsed.data.code ?? "");
  const duplicate = existing.find((position) => {
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

  const positionId = await createPosition({
    companyId: parsed.data.companyId,
    nameAr: parsed.data.nameAr,
    nameEn: parsed.data.nameEn,
    code: parsed.data.code ?? null,
    departmentId: parsed.data.departmentId ?? null,
    status: parsed.data.status ?? "active",
    notes: parsed.data.notes ?? null,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "position.create",
    entity: "position",
    entityId: positionId,
    metadata: { nameAr: parsed.data.nameAr, nameEn: parsed.data.nameEn },
  });

  return NextResponse.json({ positionId });
}

