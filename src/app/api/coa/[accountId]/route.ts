import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { accountUpdateSchema } from "@/lib/validators/company";
import {
  getChartAccount,
  getChartAccountByCode,
  hasChildAccounts,
  updateChartAccount,
} from "@/lib/data/chart-accounts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success || typeof body?.companyId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, body.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { accountId } = await context.params;
  const existingAccount = await getChartAccount(accountId);
  if (!existingAccount || existingAccount.companyId !== body.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existingAccount.system) {
    const allowedUpdates = Object.keys(parsed.data).every(
      (key) => key === "name"
    );
    if (!allowedUpdates) {
      return NextResponse.json(
        { error: "System accounts cannot be modified" },
        { status: 403 }
      );
    }
  }

  if (parsed.data.code) {
    const existingCode = await getChartAccountByCode(
      body.companyId,
      parsed.data.code
    );
    if (existingCode && existingCode.id !== accountId) {
      return NextResponse.json(
        { error: "Account code already exists" },
        { status: 409 }
      );
    }
  }

  if (parsed.data.parentId) {
    if (parsed.data.parentId === accountId) {
      return NextResponse.json({ error: "Invalid parent account" }, { status: 400 });
    }
    const parent = await getChartAccount(parsed.data.parentId);
    if (!parent || parent.companyId !== body.companyId) {
      return NextResponse.json({ error: "Invalid parent account" }, { status: 400 });
    }
    if (parent.isPosting) {
      return NextResponse.json({ error: "Parent must be a header account" }, { status: 400 });
    }
  }

  if (parsed.data.isPosting === true) {
    const hasChildren = await hasChildAccounts(accountId);
    if (hasChildren) {
      return NextResponse.json(
        { error: "Accounts with children cannot be posting accounts" },
        { status: 400 }
      );
    }
  }

  if (parsed.data.status === "inactive") {
    const hasChildren = await hasChildAccounts(accountId);
    if (hasChildren) {
      return NextResponse.json(
        { error: "Header accounts with children cannot be deactivated" },
        { status: 400 }
      );
    }
  }

  await updateChartAccount(accountId, parsed.data);
  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "coa.update",
    entity: "chart_account",
    entityId: accountId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ok: true });
}
