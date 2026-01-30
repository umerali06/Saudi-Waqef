import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { accountSchema } from "@/lib/validators/company";
import {
  createChartAccount,
  getChartAccount,
  getChartAccountByCode,
  listChartAccounts,
} from "@/lib/data/chart-accounts";
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

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accounts = await listChartAccounts(companyId);
  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await getChartAccountByCode(
    parsed.data.companyId,
    parsed.data.code
  );
  if (existing) {
    return NextResponse.json({ error: "Account code already exists" }, { status: 409 });
  }

  if (parsed.data.parentId) {
    const parent = await getChartAccount(parsed.data.parentId);
    if (!parent || parent.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid parent account" }, { status: 400 });
    }
    if (parent.isPosting) {
      return NextResponse.json({ error: "Parent must be a header account" }, { status: 400 });
    }
  }

  const accountId = await createChartAccount(parsed.data);
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "coa.create",
    entity: "chart_account",
    entityId: accountId,
    metadata: { code: parsed.data.code },
  });
  return NextResponse.json({ accountId });
}

